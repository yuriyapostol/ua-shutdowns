const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const settingsSource = readFileSync(require.resolve('../address-settings.js'), 'utf8');
const popupSource = readFileSync(require.resolve('../popup.js'), 'utf8');

function storage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get() { return structuredClone(data); },
    async set(values) { Object.assign(data, structuredClone(values)); }
  };
}

function settings(local) {
  return vm.runInNewContext(settingsSource + '\nAddressSettings;', {
    chrome: { storage: { local } }
  });
}

function popup(local) {
  const elements = Object.fromEntries(['address-form', 'address-fields', 'status', 'city', 'street', 'house', 'auto-close-popups']
    .map(id => [id, { value: '', checked: false, textContent: '', dataset: {}, disabled: id === 'address-fields',
      handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } }]));
  vm.runInNewContext(settingsSource + '\n' + popupSource, {
    chrome: { storage: { local } },
    document: { getElementById: id => elements[id] }
  });
  return {
    elements,
    async ready() { for (let i = 0; i < 10; i++) await Promise.resolve(); },
    async submit(address) {
      for (const [field, value] of Object.entries(address)) elements[field].value = value;
      await elements['address-form'].handlers.submit({ preventDefault() {} });
    }
  };
}

const address = { city: 'Біла Церква', street: 'Героїв Небесної Сотні', house: '23 Б' };

test('has no address until the user first saves settings', async () => {
  assert.equal(await settings(storage()).load(), null);
});

test('persists a normalized address for a new popup or content script context', async () => {
  const local = storage();
  await settings(local).save({ city: '  Біла   Церква ', street: ' Героїв Небесної Сотні ', house: '23 Б ' });
  assert.deepEqual({ ...await settings(local).load() }, address);
});

test('rejects blank, partial and invalid addresses without overwriting saved data', async () => {
  const local = storage({ address });
  for (const invalid of [null, {}, { ...address, city: '  ' }, { ...address, street: 123 }, { ...address, house: '' }]) {
    await assert.rejects(settings(local).save(invalid), /Заповніть/);
  }
  assert.deepEqual(local.data.address, address);
});

test('propagates storage errors and does not silently replace malformed saved settings with defaults', async () => {
  await assert.rejects(settings({ get: async () => { throw new Error('unavailable'); } }).load(), /unavailable/);
  await assert.rejects(settings(storage({ address: {} })).load(), /Заповніть/);
});

test('popup loads, saves and shows the same address when reopened', async () => {
  const local = storage();
  const first = popup(local);
  assert.equal(first.elements['address-fields'].disabled, true);
  await first.ready();
  for (const field of ['city', 'street', 'house']) assert.equal(first.elements[field].value, '');
  assert.equal(first.elements.status.dataset.error, 'false');
  await first.submit(address);
  assert.equal(first.elements.status.textContent, 'Налаштування збережено.');
  const reopened = popup(local);
  await reopened.ready();
  for (const [field, value] of Object.entries(address)) assert.equal(reopened.elements[field].value, value);
});

test('popup reports failed saves and retains the edited address for retry', async () => {
  const local = storage();
  local.set = async () => { throw new Error('unavailable'); };
  const p = popup(local);
  await p.ready();
  await p.submit(address);
  assert.equal(p.elements.status.dataset.error, 'true');
  assert.match(p.elements.status.textContent, /Не вдалося зберегти/);
  assert.equal(p.elements.city.value, address.city);
  assert.equal(p.elements['address-fields'].disabled, false);
});

test('popup closing is opt-in and saving an address alone preserves the preference', async () => {
  const local = storage({ address });
  assert.deepEqual({ ...await settings(local).loadPreferences() }, { autoClosePopups: false });
  await settings(local).save(address, { autoClosePopups: true });
  assert.equal((await settings(local).loadPreferences()).autoClosePopups, true);
  await settings(local).save(address);
  assert.equal(local.data.autoClosePopups, true);
});

test('popup checkbox persists when reopened and can be switched off again', async () => {
  const local = storage({ address });
  const first = popup(local);
  await first.ready();
  assert.equal(first.elements['auto-close-popups'].checked, false);
  first.elements['auto-close-popups'].checked = true;
  await first.submit(address);
  assert.equal(local.data.autoClosePopups, true);
  const reopened = popup(local);
  await reopened.ready();
  assert.equal(reopened.elements['auto-close-popups'].checked, true);
  reopened.elements['auto-close-popups'].checked = false;
  await reopened.submit(address);
  assert.equal(local.data.autoClosePopups, false);
  assert.deepEqual(local.data.address, address);
});

test('checkbox changes are saved immediately without submitting or validating an edited address', async () => {
  const local = storage({ address });
  const p = popup(local);
  await p.ready();
  p.elements.city.value = '';
  p.elements['auto-close-popups'].checked = true;
  await p.elements['auto-close-popups'].handlers.change();
  assert.equal(local.data.autoClosePopups, true);
  assert.deepEqual(local.data.address, address);
  assert.equal(p.elements.city.value, '');
  const reopened = popup(local);
  await reopened.ready();
  assert.equal(reopened.elements['auto-close-popups'].checked, true);
  reopened.elements['auto-close-popups'].checked = false;
  await reopened.elements['auto-close-popups'].handlers.change();
  assert.equal(local.data.autoClosePopups, false);
});

test('popup closing can be enabled before any address has been saved', async () => {
  const local = storage();
  const p = popup(local);
  await p.ready();
  p.elements['auto-close-popups'].checked = true;
  await p.elements['auto-close-popups'].handlers.change();
  assert.equal(local.data.autoClosePopups, true);
  assert.equal(await settings(local).load(), null);
  assert.equal(p.elements.city.value, '');
});

test('a failed checkbox save restores its previous state and permits retrying', async () => {
  const local = storage({ address });
  local.set = async () => { throw new Error('unavailable'); };
  const p = popup(local);
  await p.ready();
  p.elements['auto-close-popups'].checked = true;
  await p.elements['auto-close-popups'].handlers.change();
  assert.equal(p.elements['auto-close-popups'].checked, false);
  assert.equal(p.elements['auto-close-popups'].disabled, false);
  assert.equal(p.elements['address-fields'].disabled, false);
  assert.equal(p.elements.status.dataset.error, 'true');
});

test('popup allows saving a new address after a loading error', async () => {
  const local = storage();
  local.get = async () => { throw new Error('unavailable'); };
  const p = popup(local);
  await p.ready();
  assert.equal(p.elements.status.dataset.error, 'true');
  await p.submit(address);
  assert.deepEqual(local.data.address, address);
  assert.equal(p.elements.status.dataset.error, 'false');
});
