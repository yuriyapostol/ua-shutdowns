(function() {
  'use strict';

  const controller = new AbortController();
  const { signal } = controller;
  const fieldTimeout = 10000;

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

  async function setAddress() {
    try {
      const address = await AddressSettings.load();
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
        if (signal.aborted || !await selectField(field)) break;
      }
    } catch (error) {
      console.warn('UA Shutdowns: automatic address selection stopped.', error);
    } finally {
      // A single attempt per page load. No retries can overwrite a manual choice.
      controller.abort();
    }
  }

  setAddress();
})();
