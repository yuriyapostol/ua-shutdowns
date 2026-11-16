(function() {
  'use strict';

  const byId = id => document.getElementById(id);
  const fields = Object.fromEntries(['region', 'city', 'street', 'house'].map(field => [field, byId(field)]));
  const views = ['home', 'form', 'settings', 'popup-offer'];
  let addresses = [];
  let editingId = null;
  let busy = true;
  let cityBeforeKyiv = '';
  let selectedDate = DtekSchedule.dateKey();

  function status(message = '', error = false) {
    byId('status').textContent = message;
    byId('status').dataset.error = String(error);
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll('button, input, select, fieldset')) {
      control.disabled = value || control.dataset.available === 'false';
    }
  }
  function show(view, title) {
    for (const name of views) byId(name + '-view').hidden = name !== view;
    byId('nav-back').hidden = view === 'home';
    byId('screen-title').textContent = title;
    document.title = title + ' — UA Shutdowns';
    byId('delete-confirmation').hidden = true;
    status();
    byId('screen-title').tabIndex = -1;
    byId('screen-title').focus();
  }
  function home() {
    render();
    show('home', 'Графік відключень світла');
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function render() {
    byId('schedule-date').value = selectedDate;
    const today = DtekSchedule.dateKey();
    const shortcut = selectedDate === today ? 'today' : selectedDate === DtekSchedule.shiftDate(today, 1) ? 'tomorrow' : 'other';
    for (const name of ['today', 'tomorrow', 'other']) {
      byId('date-' + name).setAttribute('aria-pressed', String(name === shortcut));
    }
    for (const [id, offset] of [['date-previous', -1], ['date-next', 1]]) {
      const available = DtekSchedule.shiftDate(selectedDate, offset) !== null;
      byId(id).dataset.available = String(available);
      byId(id).disabled = busy || !available;
    }
    const container = byId('address-list');
    container.replaceChildren();
    const groups = [...DtekSites.regions, { id: '', name: 'Уточніть представництво' }];
    for (const region of groups) {
      const items = addresses.filter(address => address.region === region.id);
      if (!items.length) continue;
      const section = make('section', 'address-group');
      section.append(make('h2', '', region.name));
      if (!region.id) section.append(make('p', 'migration-note', 'Для раніше збереженої адреси потрібно обрати регіон.'));
      for (const address of items) {
        const schedule = DtekSchedule.forDate(address, selectedDate);
        const queue = schedule ? (schedule.queue ?? address.queue) : address.queue;
        const row = make('article', 'address-card');
        const open = make('button', 'address-open');
        open.type = 'button';
        open.append(
          make('span', 'address-city', address.city),
          make('strong', '', `${address.street}, ${address.house}`),
          make('span', 'address-queue', `Черга: ${queue || '—'}`)
        );
        open.setAttribute('aria-label', `${region.id ? 'Відкрити графік' : 'Обрати регіон'}: ${address.city}, ${address.street}, ${address.house}`);
        open.addEventListener('click', () => region.id ? openAddress(address) : edit(address));
        const button = make('button', 'edit-address');
        button.type = 'button';
        button.title = 'Редагувати адресу';
        button.setAttribute('aria-label', `Редагувати: ${address.city}, ${address.street}, ${address.house}`);
        const icon = make('img');
        icon.src = 'images/edit.svg';
        icon.alt = '';
        icon.width = 24;
        icon.height = 24;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        button.addEventListener('click', () => edit(address));
        const outages = make('div', 'address-outages');
        outages.setAttribute('aria-label', `Відключення на ${selectedDate}`);
        const available = DtekSchedule.isValid(schedule);
        if (available) {
          schedule.lines.forEach((line, index) => {
            if (schedule.lines.length > 1) outages.append(make('span', 'outage-line', `Лінія ${index + 1}`));
            if (!line.length) outages.append(make('span', 'outage-note', 'Без відключень'));
            for (const [start, end] of line) {
              outages.append(make('span', 'outage-interval', `${DtekSchedule.format(start)} – ${DtekSchedule.format(end)}`));
            }
          });
        } else outages.append(make('span', 'outage-note', selectedDate < DtekSchedule.dateKey() ? 'Графік не збережено' : 'Графік не отримано'));
        const actions = make('div', 'address-actions');
        const copy = make('button', 'copy-schedule');
        copy.type = 'button';
        copy.dataset.available = String(available === true);
        copy.disabled = !available;
        copy.title = available ? 'Копіювати графік відключень' : 'За вибрану дату графіка ще немає';
        copy.setAttribute('aria-label', `Копіювати графік на ${selectedDate}: ${address.city}, ${address.street}, ${address.house}`);
        const copyIcon = make('img');
        copyIcon.src = 'images/content-copy.svg';
        copyIcon.alt = '';
        copyIcon.width = 24;
        copyIcon.height = 24;
        copyIcon.setAttribute('aria-hidden', 'true');
        copy.append(copyIcon);
        copy.addEventListener('click', async () => {
          if (busy) return;
          try {
            const text = DtekSchedule.toText(address, region, schedule);
            await navigator.clipboard.writeText(text);
            status('Графік скопійовано.');
          } catch {
            status('Не вдалося скопіювати графік. Спробуйте ще раз.', true);
          }
        });
        actions.append(copy, button);
        row.append(open, outages, actions);
        section.append(row);
      }
      container.append(section);
    }
    byId('empty-state').hidden = addresses.length > 0;
  }
  function selectDate(date) {
    if (busy) return;
    if (!DtekSchedule.validDate(date)) {
      byId('schedule-date').value = selectedDate;
      return;
    }
    selectedDate = date;
    render();
    status();
  }
  byId('date-previous').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(selectedDate, -1)));
  byId('date-next').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(selectedDate, 1)));
  byId('schedule-date').addEventListener('change', event => selectDate(event.target.value));
  byId('date-today').addEventListener('click', () => selectDate(DtekSchedule.dateKey()));
  byId('date-tomorrow').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(DtekSchedule.dateKey(), 1)));
  byId('date-other').addEventListener('click', () => {
    if (busy) return;
    const input = byId('schedule-date');
    input.focus();
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch { input.click(); }
  });
  function regionChanged() {
    const region = DtekSites.get(fields.region.value);
    if (region?.city) {
      if (!fields.city.readOnly) cityBeforeKyiv = fields.city.value;
      fields.city.value = region.city;
      fields.city.readOnly = true;
    } else {
      if (fields.city.readOnly) fields.city.value = cityBeforeKyiv;
      fields.city.readOnly = false;
    }
  }
  function edit(address = null) {
    if (busy) return;
    editingId = address?.id || null;
    fields.city.readOnly = false;
    for (const field of Object.keys(fields)) fields[field].value = address?.[field] || '';
    cityBeforeKyiv = fields.city.value;
    regionChanged();
    byId('delete-address').hidden = !editingId;
    show('form', editingId ? 'Редагування адреси' : 'Додавання адреси');
  }
  async function openAddress(address) {
    if (busy) return;
    setBusy(true);
    status('Відкриття графіка…');
    try {
      await AddressNavigation.open(address);
      window.close();
    } catch {
      status('Не вдалося відкрити графік. Спробуйте ще раз.', true);
    } finally { setBusy(false); }
  }

  for (const region of DtekSites.regions) {
    const option = make('option', '', `${region.name} — ${region.operator}`);
    option.value = region.id;
    fields.region.append(option);
  }
  async function dismissPopupOffer() {
    if (busy) return;
    setBusy(true);
    try {
      await AddressSettings.dismissPopupOffer();
      home();
    } catch {
      status('Не вдалося зберегти відповідь. Спробуйте ще раз.', true);
    } finally { setBusy(false); }
  }
  byId('nav-back').addEventListener('click', () => {
    if (busy) return;
    if (!byId('popup-offer-view').hidden) void dismissPopupOffer();
    else home();
  });
  byId('dismiss-popup-offer').addEventListener('click', dismissPopupOffer);
  byId('accept-popup-offer').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      await AddressSettings.savePreferences({ autoClosePopups: true });
      byId('auto-close-popups').checked = true;
      home();
      status('Автоматичне закриття спливаючих вікон увімкнено.');
    } catch {
      status('Не вдалося зберегти налаштування. Спробуйте ще раз.', true);
    } finally { setBusy(false); }
  });
  byId('add-address').addEventListener('click', () => edit());
  byId('open-settings').addEventListener('click', () => { if (!busy) show('settings', 'Налаштування'); });
  fields.region.addEventListener('change', regionChanged);
  byId('address-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    status('Збереження…');
    try {
      await AddressSettings.upsert(Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])), editingId);
      addresses = await AddressSettings.list();
      home();
      status('Адресу збережено.');
    } catch (error) {
      status(error.message || 'Не вдалося зберегти адресу.', true);
    } finally { setBusy(false); }
  });
  byId('delete-address').addEventListener('click', () => {
    if (busy) return;
    byId('delete-address-archive').checked = false;
    byId('delete-confirmation').hidden = false;
  });
  byId('cancel-delete').addEventListener('click', () => { byId('delete-confirmation').hidden = true; });
  byId('confirm-delete').addEventListener('click', async () => {
    if (busy || !editingId) return;
    setBusy(true);
    try {
      const deleteArchive = byId('delete-address-archive').checked;
      await AddressSettings.remove(editingId, { deleteArchive });
      addresses = await AddressSettings.list();
      home();
      status(deleteArchive ? 'Адресу та її архів видалено.' : 'Адресу видалено. Архів збережено.');
    } catch { status('Не вдалося видалити адресу. Спробуйте ще раз.', true); }
    finally { setBusy(false); }
  });
  byId('auto-close-popups').addEventListener('change', async event => {
    if (busy) return;
    const checked = event.target.checked;
    setBusy(true);
    try {
      await AddressSettings.savePreferences({ autoClosePopups: checked });
      status('Налаштування збережено.');
    } catch {
      event.target.checked = !checked;
      status('Не вдалося зберегти налаштування. Спробуйте ще раз.', true);
    } finally { setBusy(false); }
  });

  async function load() {
    try {
      const [saved, preferences, offer] = await Promise.all([
        AddressSettings.list(), AddressSettings.loadPreferences(), AddressSettings.shouldOfferPopupClosing()
      ]);
      addresses = saved;
      byId('auto-close-popups').checked = preferences.autoClosePopups;
      home();
      if (offer) show('popup-offer', 'Автоматичне закриття вікон на графіку відключень');
    } catch { status('Не вдалося завантажити адреси. Закрийте й відкрийте вікно, щоб повторити спробу.', true); }
    finally { setBusy(false); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.addresses && !changes.addressArchives)) return;
    AddressSettings.list().then(saved => {
      addresses = saved;
      if (!busy && !byId('home-view').hidden) render();
    }).catch(() => { status('Не вдалося оновити графіки. Спробуйте відкрити розширення ще раз.', true); });
  });
  load();
})();
