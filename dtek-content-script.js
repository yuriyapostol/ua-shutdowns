(function() {
  'use strict';

  const controller = new AbortController();
  const { signal } = controller;
  const fieldTimeout = 10000;
  let selectedQueue = '';

  function contextInvalidated(error) {
    return !chrome.runtime?.id || error?.message?.includes('Extension context invalidated');
  }

  function queueFromRaw(raw) {
    const groups = raw.split(',').map(value => value.trim().match(/^(?:GPV)?(\d+(?:\.\d+)?)$/)?.[1]);
    return groups.length && groups.every(Boolean) ? [...new Set(groups)].join(', ') : '';
  }

  // Only real interaction cancels automation; our synthetic events must not cancel it.
  function onInteraction(event) {
    if (event.isTrusted && event.target.closest?.(
      '#city, #street, #house_num, .discon-input-wrapper, .autocomplete-items'
    )) controller.abort();
  }

  const interactionEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'input', 'change'];
  for (const type of interactionEvents) {
    document.addEventListener(type, onInteraction, { capture: true, signal });
  }

  function pause(ms) {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    });
  }

  async function waitFor(read, deadline) {
    while (!signal.aborted && Date.now() < deadline) {
      const result = read();
      if (result) return result;
      await pause(50);
    }
    return null;
  }

  function plain(value) {
    return value.normalize('NFKC').toLocaleLowerCase('uk').trim()
      .replace(/[’'`ʼ]/g, "'").replace(/\s+/g, ' ');
  }

  function normalize(value, house) {
    value = plain(value);
    if (house) {
      const letters = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к',
        m: 'м', o: 'о', p: 'р', t: 'т', x: 'х' };
      // Keep slashes and hyphens: 17/1 and 171 are different buildings.
      return value.replace(/[abcehikmoptx]/g, letter => letters[letter]).replace(/[\s.]/g, '');
    }
    return geographicName(value);
  }

  function geographicName(value) {
    return value.replace(/\([^)]*\)/g, ' ')
      .replace(/(^|\s)(?:м\.|с\.|смт\.?|місто|село|селище|вул\.?|вулиця|пров\.?|провулок|просп\.?|проспект|бул\.?|бульвар|площа|пл\.)(?=\s|$)/gi, ' ')
      .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function distance(left, right) {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
      const row = [i];
      for (let j = 1; j <= right.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
          previous[j - 1] + Number(left[i - 1] !== right[j - 1]));
      }
      previous = row;
    }
    return previous[right.length];
  }

  function bestMatch(values, target, house) {
    const wanted = normalize(target, house);
    if (!wanted) return null;
    let best = null;
    for (const value of values) {
      const candidate = normalize(value, house);
      if (!candidate) continue;
      // A similar spelling must never turn house 17 into house 1 or 117.
      if (house && wanted.match(/^\d+/)?.[0] !== candidate.match(/^\d+/)?.[0]) continue;
      const score = distance(wanted, candidate) / Math.max(wanted.length, candidate.length);
      const tie = distance(plain(target), plain(value));
      if (score <= 0.45 && (!best || score < best.score ||
          (score === best.score && tie < best.tie))) {
        best = { value, score, tie };
      }
    }
    return best;
  }

  function queriesFor(value, house) {
    // Preserve complete words and their spelling. Commit the site's canonical
    // label only by clicking; normalization is for comparing candidates.
    const name = house ? value : geographicName(value);
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words.map((_, index) => words.slice(0, index + 1).join(' '));
  }

  function optionsFor(input) {
    const list = document.getElementById(input.id + 'autocomplete-list');
    return list ? Array.from(list.children).filter(item => item.tagName === 'DIV') : [];
  }

  function optionValue(item) {
    // The visible label may be lowercased/highlighted; the hidden value is canonical.
    return item.querySelector('input[type="hidden"]')?.value || item.textContent.trim();
  }

  async function search(input, query, deadline) {
    if (signal.aborted || Date.now() >= deadline) return [];
    const key = query.slice(-1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    await waitFor(() => optionsFor(input).length, Math.min(deadline, Date.now() + 350));
    return signal.aborted ? [] : optionsFor(input);
  }

  async function selectField(field) {
    const deadline = Date.now() + fieldTimeout;
    const input = await waitFor(() => {
      const element = document.getElementById(field.id);
      // Page-owned JavaScript properties are not shared with extension isolated worlds.
      return element && !element.disabled && element.classList.contains('active') && element;
    }, deadline);
    if (!input || signal.aborted) return false;

    const originalValue = input.value;
    const candidates = new Map();
    let lastQuery;
    let options = [];
    let selected = false;
    try {
      for (const query of queriesFor(field.value, field.house)) {
        if (signal.aborted || Date.now() >= deadline) break;
        lastQuery = query;
        options = await search(input, query, deadline);
        for (const option of options) {
          candidates.set(optionValue(option), query);
        }
        if (bestMatch(candidates.keys(), field.value, field.house)?.score === 0) break;
      }
      const best = bestMatch(candidates.keys(), field.value, field.house);
      if (!best || signal.aborted) return false;

      let option = options.find(item => optionValue(item) === best.value);
      if (!option) {
        // If the best fuzzy match came from an earlier search, reopen that same
        // fragment, preserving the site's original value and dependent lists.
        lastQuery = candidates.get(best.value);
        options = await search(input, lastQuery, deadline);
        option = options.find(item => optionValue(item) === best.value);
      }
      if (!option || signal.aborted) return false;
      if (field.house) {
        // Read the actual building option before the site's click handler removes it.
        const raw = option.querySelector('input[type="hidden"]')?.getAttribute?.('data-key-group') || '';
        selectedQueue = queueFromRaw(raw);
      }
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      selected = true;
      return true;
    } finally {
      if (!selected && !signal.aborted && input.value === lastQuery) {
        input.value = originalValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function watchSchedule(address, fields) {
    // The site may replace or insert the schedule container after selection.
    const root = document.body || document.getElementById('discon-fact');
    if (!root || typeof MutationObserver !== 'function') return;
    const messageEvent = chrome.runtime.onMessage;
    const chosen = fields.map(field => [field.id, document.getElementById(field.id)?.value]);
    let timer;
    let stopped = false;
    let saving = Promise.resolve();
    const isScheduleNode = node => node?.id === 'discon-fact' ||
      node?.closest?.('#discon-fact') || node?.querySelector?.('#discon-fact');
    const observer = new MutationObserver(records => {
      if (!records.some(record => isScheduleNode(record.target) ||
          [...record.addedNodes, ...record.removedNodes].some(isScheduleNode))) return;
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    });
    const matchesAddress = () => chosen.every(([id, value]) => document.getElementById(id)?.value === value);
    function stop() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('input', onManualInput, true);
      document.removeEventListener('change', onManualInput, true);
      window.removeEventListener('pagehide', onPageHide);
      // Chrome may invalidate the extension while this tab and its DOM survive.
      // Local observers still need cleanup even if the event API now throws.
      try { messageEvent.removeListener(onRefresh); }
      catch { /* An invalidated extension no longer owns a usable message listener. */ }
    }
    function update() {
      // A popup refresh must wait for the latest read and its storage write,
      // including when an observer-triggered save is already in progress.
      saving = saving.then(async () => {
        if (stopped) return { ok: false };
        if (!chrome.runtime?.id) { stop(); return { ok: false }; }
        if (document.visibilityState !== 'visible') return { ok: false };
        if (!matchesAddress()) { stop(); return { ok: false }; }
        const schedules = DtekSchedule.readAll(document);
        if (!schedules.length) return { ok: false };
        const raw = document.getElementById('house_num')?.getAttribute('data-key-group');
        const queue = raw == null ? selectedQueue : queueFromRaw(raw);
        const response = await chrome.runtime.sendMessage({ type: 'save-address-queue', address, queue, schedules });
        if (!response?.ok) throw new Error(response?.error || I18n.t('schedule_storage_save_error'));
        return { ok: true };
      }).catch(error => {
        if (contextInvalidated(error)) { stop(); return { ok: false }; }
        console.warn('UA Shutdowns: schedule update could not be saved.', error);
        return { ok: false };
      });
      return saving;
    }
    function onRefresh(message, sender, sendResponse) {
      if (!chrome.runtime?.id) { stop(); return; }
      if (message?.type !== 'refresh-address-schedule' ||
          sender.url !== chrome.runtime.getURL('popup.html')) return;
      clearTimeout(timer);
      update().then(sendResponse);
      return true;
    }
    function onVisibility() {
      observer.disconnect();
      clearTimeout(timer);
      if (stopped) return;
      if (!chrome.runtime?.id) { stop(); return; }
      if (document.visibilityState !== 'visible') return;
      if (!matchesAddress()) { stop(); return; }
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      void update();
    }
    function onManualInput(event) {
      if (event.isTrusted && chosen.some(([id]) => event.target.id === id)) stop();
    }
    function onPageHide(event) { if (!event.persisted) stop(); }
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('input', onManualInput, true);
    document.addEventListener('change', onManualInput, true);
    window.addEventListener('pagehide', onPageHide);
    messageEvent.addListener(onRefresh);
    onVisibility();
  }

  async function setAddress() {
    try {
      await I18n.init();
      const url = new URL(location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      const legacyAddressId = fragment.get('ua-shutdowns-address');
      const response = await chrome.runtime.sendMessage({ type: 'get-page-address', legacyAddressId });
      if (!response?.ok) throw new Error(response?.error || I18n.t('address_website_load_error'));
      if (legacyAddressId !== null) {
        fragment.delete('ua-shutdowns-address');
        url.hash = fragment.toString();
        history.replaceState(history.state, '', url.href);
      }
      const address = response.address;
      if (!address) return;
      // Kyiv's site has only street and house fields; the settlement is fixed.
      // Do not apply an address from another city to similarly named Kyiv streets.
      const isKyiv = /^(www\.)?dtek-kem\.com\.ua$/.test(location.hostname);
      if (isKyiv && normalize(address.city) !== normalize('Київ')) return;
      const fields = [
        ...(isKyiv ? [] : [{ id: 'city', value: address.city }]),
        { id: 'street', value: address.street },
        { id: 'house_num', value: address.house, house: true }
      ];
      for (const field of fields) {
        if (signal.aborted || !await selectField(field)) return;
      }
      if (!signal.aborted) {
        watchSchedule(address, fields);
        const schedule = await waitFor(() => DtekSchedule.read(document), Date.now() + 3000);
        if (signal.aborted || !chrome.runtime?.id) return;
        const schedules = DtekSchedule.readAll(document);
        const saved = await chrome.runtime.sendMessage({ type: 'save-address-queue', address, queue: selectedQueue, schedule, schedules });
        if (!saved?.ok) throw new Error(saved?.error || I18n.t('schedule_group_save_error'));
      }
    } catch (error) {
      if (!contextInvalidated(error)) console.warn('UA Shutdowns: automatic address selection stopped.', error);
    } finally {
      // A single attempt per page load. No retries can overwrite a manual choice.
      controller.abort();
    }
  }

  setAddress();
})();
