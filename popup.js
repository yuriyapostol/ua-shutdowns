(function() {
  'use strict';

  const byId = id => document.getElementById(id);
  const fields = Object.fromEntries(['region', 'city', 'street', 'house'].map(field => [field, byId(field)]));
  const views = ['home', 'form', 'settings'];
  let addresses = [];
  let editingId = null;
  let busy = true;
  let cityBeforeKyiv = '';

  function status(message = '', error = false) {
    byId('status').textContent = message;
    byId('status').dataset.error = String(error);
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll('button, input, select, fieldset')) control.disabled = value;
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
        const row = make('article', 'address-card');
        const open = make('button', 'address-open');
        open.type = 'button';
        open.append(make('strong', '', `${address.street}, ${address.house}`), make('span', '', address.city));
        open.setAttribute('aria-label', `${region.id ? 'Відкрити графік' : 'Обрати регіон'}: ${address.city}, ${address.street}, ${address.house}`);
        open.addEventListener('click', () => region.id ? openAddress(address) : edit(address));
        const button = make('button', 'edit-address');
        button.type = 'button';
        button.title = 'Редагувати адресу';
        button.setAttribute('aria-label', `Редагувати: ${address.city}, ${address.street}, ${address.house}`);
        const icon = make('img');
        icon.src = 'images/edit-square.svg';
        icon.alt = '';
        icon.width = 24;
        icon.height = 24;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        button.addEventListener('click', () => edit(address));
        row.append(open, button);
        section.append(row);
      }
      container.append(section);
    }
    byId('empty-state').hidden = addresses.length > 0;
  }
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
  byId('nav-back').addEventListener('click', () => { if (!busy) home(); });
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
  byId('delete-address').addEventListener('click', () => { if (!busy) byId('delete-confirmation').hidden = false; });
  byId('cancel-delete').addEventListener('click', () => { byId('delete-confirmation').hidden = true; });
  byId('confirm-delete').addEventListener('click', async () => {
    if (busy || !editingId) return;
    setBusy(true);
    try {
      await AddressSettings.remove(editingId);
      addresses = await AddressSettings.list();
      home();
      status('Адресу видалено.');
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
      const [saved, preferences] = await Promise.all([AddressSettings.list(), AddressSettings.loadPreferences()]);
      addresses = saved;
      byId('auto-close-popups').checked = preferences.autoClosePopups;
      home();
    } catch { status('Не вдалося завантажити адреси. Закрийте й відкрийте вікно, щоб повторити спробу.', true); }
    finally { setBusy(false); }
  }
  load();
})();
