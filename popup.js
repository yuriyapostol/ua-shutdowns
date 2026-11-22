(function() {
  'use strict';

  const byId = id => document.getElementById(id);
  const fields = Object.fromEntries(['region', 'city', 'street', 'house'].map(field => [field, byId(field)]));
  const views = ['home', 'form', 'delete', 'settings', 'popup-offer', 'share'];
  let addresses = [];
  let editingId = null;
  let initialFields = {};
  let busy = true;
  let cityBeforeKyiv = '';
  let selectedDate = DtekSchedule.dateKey();
  let dateDraft = false;
  let calendarDate = selectedDate;
  let calendarOpener;
  let restoringCalendarFocus = false;
  let sharingText = '';
  let shareRequest = 0;
  let shareQrTimer;

  for (const select of document.querySelectorAll('select')) {
    select.addEventListener('pointermove', event => {
      const bounds = select.getBoundingClientRect();
      select.classList.toggle('over-select-arrow', event.target === select &&
        event.clientX >= bounds.right - 30 && event.clientX <= bounds.right - 6 &&
        event.clientY >= bounds.top + (bounds.height - 24) / 2 && event.clientY <= bounds.top + (bounds.height + 24) / 2);
    });
    select.addEventListener('pointerleave', () => select.classList.remove('over-select-arrow'));
  }

  function status(message = '', error = false) {
    byId('status').textContent = message;
    byId('status').dataset.error = String(error);
  }
  function setBusy(value) {
    busy = value;
    if (value) closeCalendar(false);
    for (const control of document.querySelectorAll('button, input, select, textarea, fieldset')) {
      control.disabled = value || control.dataset.available === 'false';
    }
    updateSaveButton();
  }
  function hasAddressChanges() {
    return Object.entries(fields).some(([name, input]) => input.value !== initialFields[name]);
  }
  function updateSaveButton() {
    const changed = hasAddressChanges();
    byId('save-address').disabled = busy || (editingId !== null && !changed);
    byId('save-address').dataset.current = String(!busy && editingId !== null && !changed);
  }
  function show(view, title) {
    closeCalendar(false);
    if (view !== 'share') { sharingText = ''; shareRequest++; clearTimeout(shareQrTimer); }
    for (const name of views) byId(name + '-view').hidden = name !== view;
    byId('nav-back').hidden = view === 'home';
    const backLabel = view === 'delete' ? 'До редагування адреси' : 'На головну';
    byId('nav-back').setAttribute('aria-label', backLabel);
    byId('nav-back').title = backLabel;
    byId('screen-title').textContent = title;
    document.title = title + ' — UA Shutdowns';
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
    if (!dateDraft) byId('schedule-date').value = selectedDate.split('-').reverse().join('.');
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
          make('span', 'address-queue', `Черга ${queue || '—'}`)
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
        const share = make('button', 'share-schedule');
        share.type = 'button';
        share.dataset.available = String(available === true);
        share.disabled = !available;
        share.title = available ? 'Поділитись графіком' : 'За вибрану дату графіка ще немає';
        share.setAttribute('aria-label', `Поділитись графіком на ${selectedDate}: ${address.city}, ${address.street}, ${address.house}`);
        const shareIcon = make('img');
        shareIcon.src = 'images/share.svg';
        shareIcon.alt = '';
        shareIcon.width = 24;
        shareIcon.height = 24;
        shareIcon.setAttribute('aria-hidden', 'true');
        share.append(shareIcon);
        share.addEventListener('click', () => { void shareSchedule(address, region, schedule); });
        actions.append(share, button);
        row.append(open, outages, actions);
        section.append(row);
      }
      container.append(section);
    }
    byId('empty-state').hidden = addresses.length > 0;
  }
  function shareSchedule(address, region, schedule) {
    if (busy) return;
    try {
      sharingText = DtekSchedule.toText(address, region, schedule);
    } catch {
      status('Графік ще не отримано.', true);
      return;
    }
    byId('share-text').value = sharingText;
    show('share', 'Поділитись графіком');
    resizeShareText();
    updateShareQr();
  }
  function resizeShareText() {
    const input = byId('share-text');
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }
  function updateShareQr(delay = 0) {
    sharingText = byId('share-text').value;
    const text = sharingText;
    const request = ++shareRequest;
    clearTimeout(shareQrTimer);
    byId('copy-shared-schedule').dataset.available = String(Boolean(text));
    byId('copy-shared-schedule').disabled = busy || !text;
    if (!text || !delay) byId('share-qr').replaceChildren();
    byId('share-qr-status').textContent = text ? 'Генеруємо QR-код…' : 'Введіть текст, щоб створити QR-код.';
    byId('share-qr-status').hidden = false;
    if (!text) return;
    if (delay) shareQrTimer = setTimeout(() => { void renderShareQr(text, request); }, delay);
    else void renderShareQr(text, request);
  }
  async function renderShareQr(text, request) {
    try {
      const { scheduleQrSvg } = await import('./schedule-sharing.mjs');
      if (request !== shareRequest) return;
      const frame = make('div', 'share-qr-frame');
      frame.innerHTML = scheduleQrSvg(text);
      for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        const corner = make('span', `qr-corner qr-corner-${position}`);
        corner.setAttribute('aria-hidden', 'true');
        frame.append(corner);
      }
      byId('share-qr').replaceChildren(frame);
      byId('share-qr-status').hidden = true;
    } catch {
      if (request !== shareRequest) return;
      byId('share-qr').replaceChildren();
      byId('share-qr-status').textContent = 'Не вдалося створити QR-код. Скористайтесь кнопкою копіювання.';
    }
  }
  byId('share-message').addEventListener('click', event => {
    if (event.target === event.currentTarget) byId('share-text').focus();
  });
  byId('share-text').addEventListener('input', () => {
    resizeShareText();
    status();
    updateShareQr(500);
  });
  byId('copy-shared-schedule').addEventListener('click', async () => {
    if (busy || !sharingText || byId('share-view').hidden) return;
    try {
      await navigator.clipboard.writeText(sharingText);
      status('Графік скопійовано.');
    } catch {
      status('Не вдалося скопіювати графік. Спробуйте ще раз.', true);
    }
  });
  function selectDate(date) {
    if (busy) return;
    if (!DtekSchedule.validDate(date)) {
      byId('schedule-date').value = selectedDate.split('-').reverse().join('.');
      return;
    }
    dateDraft = false;
    byId('schedule-date').removeAttribute('aria-invalid');
    selectedDate = date;
    closeCalendar(false);
    render();
    status();
  }
  function commitTypedDate() {
    if (busy || !dateDraft) return;
    const input = byId('schedule-date');
    const match = input.value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const date = match && `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    if (!DtekSchedule.validDate(date)) {
      input.setAttribute('aria-invalid', 'true');
      status('Введіть дійсну дату у форматі ДД.ММ.РРРР.', true);
      return;
    }
    selectDate(date);
  }
  const dateInput = byId('schedule-date');
  let activeDatePart = null;
  let pointingAtDate = false;
  function datePartAtCaret(position = dateInput.selectionStart) {
    return [...dateInput.value.matchAll(/\d+/g)].slice(0, 3).find(part =>
      position >= part.index && position <= part.index + part[0].length);
  }
  function selectDatePart(onFocus = false) {
    if (document.activeElement !== dateInput || pointingAtDate || (!onFocus && dateInput.selectionStart !== dateInput.selectionEnd)) return;
    const part = datePartAtCaret(onFocus ? 0 : dateInput.selectionStart);
    if (!part) return;
    if (onFocus || activeDatePart !== part.index) {
      activeDatePart = part.index;
      dateInput.setSelectionRange(part.index, part.index + part[0].length);
    }
  }
  dateInput.addEventListener('pointerdown', () => { pointingAtDate = true; });
  document.addEventListener('pointerup', () => {
    if (!pointingAtDate) return;
    pointingAtDate = false;
    selectDatePart();
  });
  document.addEventListener('pointercancel', () => { pointingAtDate = false; });
  dateInput.addEventListener('blur', () => { activeDatePart = null; pointingAtDate = false; });
  document.addEventListener('selectionchange', () => selectDatePart());
  dateInput.addEventListener('input', () => {
    dateDraft = true;
    // Editing can move component boundaries; keep typing from triggering selection.
    activeDatePart = datePartAtCaret()?.index ?? null;
  });
  byId('schedule-date').addEventListener('change', commitTypedDate);
  byId('schedule-date').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTypedDate();
    } else if (event.key === 'Escape') {
      dateDraft = false;
      byId('schedule-date').value = selectedDate.split('-').reverse().join('.');
      byId('schedule-date').removeAttribute('aria-invalid');
      status();
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      toggleCalendar(event);
    }
  });
  byId('date-previous').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(selectedDate, -1)));
  byId('date-next').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(selectedDate, 1)));
  byId('date-today').addEventListener('click', () => selectDate(DtekSchedule.dateKey()));
  byId('date-tomorrow').addEventListener('click', () => selectDate(DtekSchedule.shiftDate(DtekSchedule.dateKey(), 1)));
  const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  monthNames.forEach((name, index) => {
    const option = make('option', '', name);
    option.value = index + 1;
    byId('calendar-month').append(option);
  });
  const calendarKey = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const calendarDay = key => new Date(key + 'T12:00:00Z');
  const daysInMonth = (year, month) => {
    const date = calendarDay(calendarKey(year, month, 1));
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return date.getUTCDate();
  };
  function closeCalendar(restoreFocus = true) {
    byId('date-calendar').hidden = true;
    for (const id of ['schedule-date', 'date-picker-toggle', 'date-other']) byId(id).setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      restoringCalendarFocus = true;
      try { calendarOpener?.focus(); }
      finally { restoringCalendarFocus = false; }
    }
  }
  function positionCalendar() {
    const panel = byId('date-calendar');
    if (panel.hidden) return;
    const viewport = document.documentElement;
    const anchor = byId('schedule-date-control').getBoundingClientRect();
    const gap = 3;
    const inset = 16;
    const below = Math.max(0, viewport.clientHeight - anchor.bottom - gap - inset);
    const above = Math.max(0, anchor.top - gap - inset);
    const openAbove = below < Math.min(panel.scrollHeight + 2, 220) && above > below;
    const available = openAbove ? above : below;
    panel.style.maxHeight = `${available}px`;
    const bounds = panel.getBoundingClientRect();
    panel.style.top = `${openAbove ? anchor.top - gap - bounds.height : anchor.bottom + gap}px`;
    panel.style.left = `${Math.max(inset, Math.min((anchor.left + anchor.right - bounds.width) / 2, viewport.clientWidth - bounds.width - inset))}px`;
  }
  function renderCalendar(focus = false) {
    const [year, month] = calendarDate.split('-').map(Number);
    byId('calendar-month').value = month;
    byId('calendar-year').value = year;
    byId('calendar-previous').disabled = year === 1 && month === 1;
    byId('calendar-next').disabled = year === 9999 && month === 12;
    byId('calendar-year-previous').disabled = year === 1;
    byId('calendar-year-next').disabled = year === 9999;
    const grid = byId('calendar-grid');
    grid.setAttribute('aria-label', `${monthNames[month - 1]}, ${year}`);
    grid.replaceChildren();
    const headers = make('div');
    headers.setAttribute('role', 'row');
    for (const name of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']) {
      const header = make('span', '', name);
      header.setAttribute('role', 'columnheader');
      headers.append(header);
    }
    grid.append(headers);
    const offset = (calendarDay(calendarKey(year, month, 1)).getUTCDay() + 6) % 7;
    const count = daysInMonth(year, month);
    const today = DtekSchedule.dateKey();
    let row;
    let focused;
    for (let slot = 0; slot < Math.ceil((offset + count) / 7) * 7; slot++) {
      if (slot % 7 === 0) {
        row = make('div');
        row.setAttribute('role', 'row');
        grid.append(row);
      }
      const cell = make('div');
      cell.setAttribute('role', 'gridcell');
      row.append(cell);
      const day = slot - offset + 1;
      if (day < 1 || day > count) continue;
      const key = calendarKey(year, month, day);
      cell.setAttribute('aria-selected', String(key === selectedDate));
      const button = make('button', 'calendar-day', day);
      button.type = 'button';
      button.dataset.date = key;
      button.tabIndex = key === calendarDate ? 0 : -1;
      button.setAttribute('aria-label', new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'UTC', dateStyle: 'full'
      }).format(calendarDay(key)));
      if (key === today) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => { selectDate(key); closeCalendar(); });
      button.addEventListener('focus', () => {
        calendarDate = key;
        for (const item of grid.querySelectorAll('button')) item.tabIndex = item === button ? 0 : -1;
      });
      button.addEventListener('keydown', event => calendarKeydown(event, key));
      cell.append(button);
      if (key === calendarDate) focused = button;
    }
    positionCalendar();
    if (focus) focused?.focus();
  }
  function moveCalendarMonth(offset, focus = false) {
    const [year, month, day] = calendarDate.split('-').map(Number);
    const index = (year - 1) * 12 + month - 1 + offset;
    if (index < 0 || index >= 9999 * 12) return;
    const nextYear = Math.floor(index / 12) + 1;
    const nextMonth = index % 12 + 1;
    calendarDate = calendarKey(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
    renderCalendar(focus);
  }
  function calendarKeydown(event, key) {
    const weekday = (calendarDay(key).getUTCDay() + 6) % 7;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    if (Object.hasOwn(offsets, event.key)) {
      event.preventDefault();
      calendarDate = DtekSchedule.shiftDate(key, offsets[event.key]) || key;
      renderCalendar(true);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveCalendarMonth((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), true);
    }
  }
  function openCalendar(opener, focusDays = true) {
    if (busy || !byId('date-calendar').hidden) return;
    calendarOpener = opener;
    calendarDate = selectedDate;
    byId('date-calendar').hidden = false;
    for (const id of ['schedule-date', 'date-picker-toggle', 'date-other']) byId(id).setAttribute('aria-expanded', 'true');
    renderCalendar(focusDays);
  }
  function toggleCalendar(event) {
    if (busy) return;
    if (!byId('date-calendar').hidden) { closeCalendar(); return; }
    if (event.currentTarget === byId('date-picker-toggle')) {
      dateInput.focus();
      selectDatePart(true);
      openCalendar(dateInput, false);
      return;
    }
    openCalendar(event.currentTarget);
  }
  byId('schedule-date').addEventListener('focus', () => {
    selectDatePart(true);
    if (!restoringCalendarFocus) openCalendar(byId('schedule-date'), false);
  });
  byId('schedule-date-control').addEventListener('click', event => {
    if (busy || event.target.closest('#date-picker-toggle')) return;
    byId('schedule-date').focus();
    openCalendar(byId('schedule-date'), false);
  });
  byId('date-other').setAttribute('aria-controls', 'date-calendar');
  byId('date-other').setAttribute('aria-expanded', 'false');
  byId('date-other').addEventListener('click', toggleCalendar);
  byId('date-picker-toggle').addEventListener('click', toggleCalendar);
  byId('calendar-previous').addEventListener('click', () => moveCalendarMonth(-1));
  byId('calendar-next').addEventListener('click', () => moveCalendarMonth(1));
  byId('calendar-year-previous').addEventListener('click', () => moveCalendarMonth(-12));
  byId('calendar-year-next').addEventListener('click', () => moveCalendarMonth(12));
  function changeCalendarMonth() {
    const year = Number(byId('calendar-year').value);
    const month = Number(byId('calendar-month').value);
    if (!Number.isInteger(year) || year < 1 || year > 9999) { renderCalendar(); return; }
    const day = Number(calendarDate.slice(-2));
    calendarDate = calendarKey(year, month, Math.min(day, daysInMonth(year, month)));
    renderCalendar();
  }
  byId('calendar-month').addEventListener('change', changeCalendarMonth);
  byId('calendar-year').addEventListener('change', changeCalendarMonth);
  document.defaultView?.addEventListener('resize', positionCalendar);
  document.addEventListener('scroll', event => {
    if (!byId('date-calendar').contains(event.target)) positionCalendar();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && !byId('date-calendar').hidden) {
      const controls = [...byId('date-calendar').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
        .filter(control => control.tabIndex >= 0);
      let target;
      if (!event.shiftKey && (event.target === dateInput || event.target === byId('date-picker-toggle'))) target = controls[0];
      else if (event.shiftKey && event.target === controls[0]) target = byId('date-picker-toggle');
      else if (!event.shiftKey && event.target === controls.at(-1) && !byId('date-next').disabled) target = byId('date-next');
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }
    if (event.key === 'Escape' && !byId('date-calendar').hidden) {
      event.preventDefault();
      closeCalendar();
    }
  });
  document.addEventListener('click', event => {
    if (!byId('date-calendar').hidden && !event.target.closest('#date-calendar, #schedule-date-control, #date-other')) closeCalendar(false);
  });
  document.addEventListener('focusin', event => {
    if (!byId('date-calendar').hidden && !event.target.closest('#date-calendar, #schedule-date-control, #date-other')) closeCalendar(false);
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
    initialFields = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
    updateSaveButton();
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
    else if (!byId('delete-view').hidden) show('form', 'Редагування адреси');
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
  for (const input of Object.values(fields)) {
    input.addEventListener('input', updateSaveButton);
    input.addEventListener('change', updateSaveButton);
  }
  byId('address-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || (editingId !== null && !hasAddressChanges())) return;
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
    if (busy || !editingId) return;
    const address = addresses.find(item => item.id === editingId);
    if (!address) return;
    byId('delete-address-archive').checked = false;
    byId('delete-address-summary').textContent = `Видалити адресу "${address.city}, ${address.street}, ${address.house}" зі списку?`;
    show('delete', 'Видалення адреси');
  });
  byId('confirm-delete').addEventListener('click', async () => {
    if (busy || !editingId || byId('delete-view').hidden) return;
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
      // Re-read the visible table before loading the archive, even if its DOM
      // update was missed while the popup was closed.
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id != null && DtekSites.forUrl(tab.url) &&
            new URL(tab.url).pathname.startsWith('/ua/shutdowns')) {
          await chrome.tabs.sendMessage(tab.id, { type: 'refresh-address-schedule' }, { frameId: 0 });
        }
      } catch {
        // An absent content script or a closed tab must not block the archive.
      }
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
