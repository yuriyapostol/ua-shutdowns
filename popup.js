(async function() {
  'use strict';

  try { await I18n.init(); }
  catch { /* Keep the browser language; load() reports storage failures below. */ }
  I18n.localizeDocument();
  document.title = I18n.t('home_screen_title') + ' — UA Shutdowns: DTEK';

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
    const backLabel = view === 'delete' ? I18n.t('navigation_back_to_address_edit') : I18n.t('navigation_back_to_home');
    byId('nav-back').setAttribute('aria-label', backLabel);
    byId('nav-back').title = backLabel;
    byId('screen-title').textContent = title;
    document.title = title + ' — UA Shutdowns: DTEK';
    status();
    byId('screen-title').tabIndex = -1;
    byId('screen-title').focus();
  }
  function home() {
    render();
    show('home', I18n.t('home_screen_title'));
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function render() {
    if (!dateDraft) byId('schedule-date').value = I18n.formatDate(selectedDate);
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
    const groups = [...DtekSites.regions, { id: '', name: I18n.t('address_list_unassigned_region_heading') }];
    for (const region of groups) {
      const items = addresses.filter(address => address.region === region.id);
      if (!items.length) continue;
      const section = make('section', 'address-group');
      section.append(make('h2', '', region.id ? I18n.t('dtek_region_' + region.id + '_name') : region.name));
      if (!region.id) section.append(make('p', 'migration-note', I18n.t('address_list_unassigned_region_hint')));
      for (const address of items) {
        const schedule = DtekSchedule.forDate(address, selectedDate);
        const queue = schedule ? (schedule.queue ?? address.queue) : address.queue;
        const row = make('article', 'address-card');
        const open = make('button', 'address-open');
        open.type = 'button';
        open.append(
          make('span', 'address-city', address.city),
          make('strong', '', `${address.street}, ${address.house}`),
          make('span', 'address-queue', I18n.t('address_list_outage_group_label', [queue || '—']))
        );
        open.setAttribute('aria-label', `${region.id ? I18n.t('address_list_open_schedule_action') : I18n.t('address_list_select_region_action')}: ${address.city}, ${address.street}, ${address.house}`);
        open.addEventListener('click', () => region.id ? openAddress(address) : edit(address));
        const button = make('button', 'edit-address');
        button.type = 'button';
        button.title = I18n.t('address_list_edit_address_tooltip');
        button.setAttribute('aria-label', I18n.t('address_list_edit_accessible_label', [`${address.city}, ${address.street}, ${address.house}`]));
        const icon = make('img');
        icon.src = 'images/edit.svg';
        icon.alt = '';
        icon.width = 24;
        icon.height = 24;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        button.addEventListener('click', () => edit(address));
        const outages = make('div', 'address-outages');
        outages.setAttribute('aria-label', I18n.t('schedule_date_accessible_label', [I18n.formatDate(selectedDate)]));
        const available = DtekSchedule.isValid(schedule);
        if (available) {
          schedule.lines.forEach((line, index) => {
            if (schedule.lines.length > 1) outages.append(make('span', 'outage-line', I18n.t('schedule_supply_line_label', [String(index + 1)])));
            if (!line.length) outages.append(make('span', 'outage-note', I18n.t('schedule_no_outages')));
            for (const [start, end] of line) {
              outages.append(make('span', 'outage-interval', `${DtekSchedule.format(start)} – ${DtekSchedule.format(end)}`));
            }
          });
        } else outages.append(make('span', 'outage-note', selectedDate < DtekSchedule.dateKey() ? I18n.t('schedule_history_date_missing') : I18n.t('schedule_selected_date_not_received')));
        const actions = make('div', 'address-actions');
        const share = make('button', 'share-schedule');
        share.type = 'button';
        share.dataset.available = String(available === true);
        share.disabled = !available;
        share.title = available ? I18n.t('schedule_share_screen_title') : I18n.t('schedule_share_unavailable_tooltip');
        share.setAttribute('aria-label', I18n.t('schedule_share_address_accessible_label', [I18n.formatDate(selectedDate), `${address.city}, ${address.street}, ${address.house}`]));
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
      status(I18n.t('schedule_share_schedule_missing_error'), true);
      return;
    }
    byId('share-text').value = sharingText;
    show('share', I18n.t('schedule_share_screen_title'));
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
    byId('share-qr-status').textContent = text ? I18n.t('schedule_share_qr_generating_status') : I18n.t('schedule_share_qr_empty_text_hint');
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
      frame.innerHTML = scheduleQrSvg(text, { title: I18n.t('home_screen_title'), alt: I18n.t('schedule_share_qr_accessible_description') });
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
      byId('share-qr-status').textContent = I18n.t('schedule_share_qr_generation_error');
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
      status(I18n.t('schedule_share_copy_success'));
    } catch {
      status(I18n.t('schedule_share_copy_error'), true);
    }
  });
  function selectDate(date) {
    if (busy) return;
    if (!DtekSchedule.validDate(date)) {
      byId('schedule-date').value = I18n.formatDate(selectedDate);
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
    const date = I18n.parseDate(input.value);
    if (!DtekSchedule.validDate(date)) {
      input.setAttribute('aria-invalid', 'true');
      status(I18n.t('date_input_invalid_error', [I18n.datePlaceholder]), true);
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
      byId('schedule-date').value = I18n.formatDate(selectedDate);
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
  function localizeMonthOptions() {
    byId('calendar-month').replaceChildren();
    for (let index = 0; index < 12; index++) {
      const name = new Intl.DateTimeFormat(I18n.locale, { month: 'long', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2024, index, 1)));
      const option = make('option', '', name);
      option.value = index + 1;
      byId('calendar-month').append(option);
    }
  }
  localizeMonthOptions();
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
    for (let index = 0; index < 7; index++) {
      const name = new Intl.DateTimeFormat(I18n.locale, { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2024, 0, 7 + (I18n.firstWeekday + index) % 7)));
      const header = make('span', '', name);
      header.setAttribute('role', 'columnheader');
      headers.append(header);
    }
    grid.append(headers);
    const offset = (calendarDay(calendarKey(year, month, 1)).getUTCDay() - I18n.firstWeekday + 7) % 7;
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
      button.setAttribute('aria-label', new Intl.DateTimeFormat(I18n.locale, {
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
    const weekday = (calendarDay(key).getUTCDay() - I18n.firstWeekday + 7) % 7;
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
    show('form', editingId ? I18n.t('address_edit_screen_title') : I18n.t('address_add_screen_title'));
  }
  async function openAddress(address) {
    if (busy) return;
    setBusy(true);
    status(I18n.t('address_open_schedule_pending'));
    try {
      await AddressNavigation.open(address);
      window.close();
    } catch {
      status(I18n.t('address_open_schedule_retry_error'), true);
    } finally { setBusy(false); }
  }

  for (const region of DtekSites.regions) {
    const option = make('option', '', `${I18n.t('dtek_region_' + region.id + '_name')} — ${I18n.t('dtek_operator_' + region.id + '_name')}`);
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
      status(I18n.t('popup_offer_response_save_error'), true);
    } finally { setBusy(false); }
  }
  byId('nav-back').addEventListener('click', () => {
    if (busy) return;
    if (!byId('popup-offer-view').hidden) void dismissPopupOffer();
    else if (!byId('delete-view').hidden) show('form', I18n.t('address_edit_screen_title'));
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
      status(I18n.t('settings_popup_closing_enabled_status'));
    } catch {
      status(I18n.t('settings_save_error'), true);
    } finally { setBusy(false); }
  });
  byId('add-address').addEventListener('click', () => edit());
  byId('open-settings').addEventListener('click', () => { if (!busy) show('settings', I18n.t('settings_screen_title')); });
  fields.region.addEventListener('change', regionChanged);
  for (const input of Object.values(fields)) {
    input.addEventListener('input', updateSaveButton);
    input.addEventListener('change', updateSaveButton);
  }
  byId('address-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || (editingId !== null && !hasAddressChanges())) return;
    setBusy(true);
    status(I18n.t('address_save_pending'));
    try {
      await AddressSettings.upsert(Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])), editingId);
      addresses = await AddressSettings.list();
      home();
      status(I18n.t('address_save_success'));
    } catch (error) {
      status(error.message || I18n.t('address_save_error'), true);
    } finally { setBusy(false); }
  });
  byId('delete-address').addEventListener('click', () => {
    if (busy || !editingId) return;
    const address = addresses.find(item => item.id === editingId);
    if (!address) return;
    byId('delete-address-archive').checked = false;
    byId('delete-address-summary').textContent = I18n.t('address_delete_confirmation_question', [`${address.city}, ${address.street}, ${address.house}`]);
    show('delete', I18n.t('address_delete_screen_title'));
  });
  byId('confirm-delete').addEventListener('click', async () => {
    if (busy || !editingId || byId('delete-view').hidden) return;
    setBusy(true);
    try {
      const deleteArchive = byId('delete-address-archive').checked;
      await AddressSettings.remove(editingId, { deleteArchive });
      addresses = await AddressSettings.list();
      home();
      status(deleteArchive ? I18n.t('address_delete_with_archive_success') : I18n.t('address_delete_keep_archive_success'));
    } catch { status(I18n.t('address_delete_error'), true); }
    finally { setBusy(false); }
  });
  const languageSelect = byId('interface-language');
  for (const { value, label } of I18n.languages) {
    const option = make('option', '', label);
    option.value = value;
    option.lang = value.replaceAll('_', '-');
    languageSelect.append(option);
  }
  languageSelect.value = I18n.preference;
  languageSelect.addEventListener('change', async () => {
    if (busy) return;
    setBusy(true);
    try {
      await I18n.setLanguage(languageSelect.value);
      I18n.localizeDocument();
      localizeMonthOptions();
      for (const option of fields.region.children) {
        if (!option.value) continue;
        option.textContent = `${I18n.t('dtek_region_' + option.value + '_name')} — ${I18n.t('dtek_operator_' + option.value + '_name')}`;
      }
      dateDraft = false;
      render();
      show('settings', I18n.t('settings_screen_title'));
      status(I18n.t('settings_save_success'));
    } catch {
      languageSelect.value = I18n.preference;
      status(I18n.t('settings_save_error'), true);
    } finally {
      setBusy(false);
      languageSelect.focus();
    }
  });

  byId('auto-close-popups').addEventListener('change', async event => {
    if (busy) return;
    const checked = event.target.checked;
    setBusy(true);
    try {
      await AddressSettings.savePreferences({ autoClosePopups: checked });
      status(I18n.t('settings_save_success'));
    } catch {
      event.target.checked = !checked;
      status(I18n.t('settings_save_error'), true);
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
      if (offer) show('popup-offer', I18n.t('popup_offer_screen_title'));
    } catch { status(I18n.t('address_list_load_error'), true); }
    finally { setBusy(false); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.addresses && !changes.addressArchives)) return;
    AddressSettings.list().then(saved => {
      addresses = saved;
      if (!busy && !byId('home-view').hidden) render();
    }).catch(() => { status(I18n.t('schedule_refresh_error'), true); });
  });
  load();
})();
