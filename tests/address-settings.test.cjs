const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const sitesSource = readFileSync(require.resolve('../dtek-sites.js'), 'utf8');
const source = readFileSync(require.resolve('../address-settings.js'), 'utf8');
const address = { region: 'krem', city: 'Тестове місто', street: 'Тестова вулиця', house: '12 А' };
function setup(initial = {}) {
  const data = structuredClone(initial);
  const local = { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } };
  let queue = Promise.resolve();
  const navigator = { locks: { request(_name, work) { const operation = queue.then(work); queue = operation.catch(() => {}); return operation; } } };
  const api = vm.runInNewContext(sitesSource + '\n' + source + '\nAddressSettings;', {
    chrome: { storage: { local } }, crypto: webcrypto, URL, URLSearchParams, navigator
  });
  return { data, local, api };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('starts with an empty address list', async () => {
  assert.deepEqual(plain(await setup().api.list()), []);
});
test('adds multiple addresses and preserves their regions and IDs', async () => {
  const { api } = setup();
  const first = await api.upsert(address);
  const second = await api.upsert({ ...address, region: 'oem' });
  assert.notEqual(first.id, second.id);
  assert.deepEqual(plain(await api.list()), [plain(first), plain(second)]);
});
test('trims fields and rejects empty fields and an unknown region', async () => {
  const { api } = setup();
  assert.equal((await api.upsert({ ...address, house: ' 12   А ' })).house, '12 А');
  for (const invalid of [null, {}, { ...address, region: 'other' }, { ...address, city: '' }, { ...address, street: ' ' }, { ...address, house: 3 }]) {
    await assert.rejects(api.upsert(invalid));
  }
});
test('fixes the city to Kyiv for the Kyiv operator', async () => {
  const { api } = setup();
  assert.equal((await api.upsert({ ...address, region: 'kem', city: '' })).city, 'Київ');
});
test('updates one address without changing its ID or another record', async () => {
  const { api } = setup();
  const first = await api.upsert(address);
  const second = await api.upsert({ ...address, house: '23' });
  const edited = await api.upsert({ ...address, region: 'dnem', house: '24' }, first.id);
  assert.equal(edited.id, first.id);
  assert.deepEqual(plain(await api.list()), [plain(edited), plain(second)]);
  await assert.rejects(api.upsert(address, 'deleted-id'), /видалено/);
});
test('rejects duplicate addresses but allows editing the same record', async () => {
  const { api } = setup();
  const saved = await api.upsert(address);
  await assert.rejects(api.upsert({ ...address, city: address.city.toUpperCase() }), /вже додано/);
  await api.upsert(address, saved.id);
});
test('migrates a legacy address once and preserves its original stored value', async () => {
  const legacy = { city: address.city, street: address.street, house: address.house };
  const { api, data } = setup({ address: legacy, autoClosePopups: true });
  const migrated = await api.list();
  assert.equal(migrated[0].region, '');
  assert.equal(migrated[0].id, 'legacy-address');
  assert.deepEqual(data.address, legacy);
  assert.equal(data.autoClosePopups, true);
  assert.deepEqual(plain(await api.list()), plain(migrated));
  await api.upsert(address, 'legacy-address');
  await api.remove('legacy-address');
  assert.deepEqual(plain(await api.list()), []);
});
test('rejects corrupt storage without overwriting it', async () => {
  const { api, data } = setup({ addresses: 'corrupt' });
  await assert.rejects(api.list());
  assert.equal(data.addresses, 'corrupt');
});
test('selects an address by region and a per-tab ID without changing other addresses', async () => {
  const { api } = setup();
  const first = await api.upsert(address);
  const second = await api.upsert({ ...address, house: '23' });
  const other = await api.upsert({ ...address, region: 'oem' });
  const base = 'https://www.dtek-krem.com.ua/ua/shutdowns';
  assert.equal((await api.forPage(base)).id, first.id);
  assert.equal((await api.forPage(base + '#ua-shutdowns-address=' + second.id)).id, second.id);
  assert.equal(await api.forPage(base + '#ua-shutdowns-address=' + other.id), null);
  assert.equal(await api.forPage(base + '#ua-shutdowns-address=deleted'), null);
  await api.remove(second.id);
  assert.equal(await api.forPage(base + '#ua-shutdowns-address=' + second.id), null);
  assert.equal((await api.forPage('https://www.dtek-oem.com.ua/ua/shutdowns')).id, other.id);
  assert.equal(await api.forPage('https://www.dtek-kem.com.ua/ua/shutdowns'), null);
  assert.equal(await api.forPage('https://www.dtek-krem.com.ua.evil.example/ua/shutdowns'), null);
});
test('does not auto-select a legacy address until a region is assigned', async () => {
  const { api } = setup({ address: { city: address.city, street: address.street, house: address.house } });
  assert.equal(await api.forPage('https://www.dtek-krem.com.ua/ua/shutdowns'), null);
});
test('preferences can be toggled independently of an empty address list', async () => {
  const { api } = setup();
  assert.equal((await api.loadPreferences()).autoClosePopups, false);
  await api.savePreferences({ autoClosePopups: true });
  assert.equal((await api.loadPreferences()).autoClosePopups, true);
  await api.savePreferences({ autoClosePopups: false });
  assert.equal((await api.loadPreferences()).autoClosePopups, false);
  assert.deepEqual(plain(await api.list()), []);
});
test('propagates storage failures without pretending that writes succeeded', async () => {
  const { api, local } = setup();
  local.set = async () => { throw new Error('unavailable'); };
  await assert.rejects(api.upsert(address), /unavailable/);
  await assert.rejects(api.savePreferences({ autoClosePopups: true }), /unavailable/);
});


test('concurrent edits from separate popups preserve both added addresses', async () => {
  const { api } = setup();
  await Promise.all([api.upsert(address), api.upsert({ ...address, house: '24' })]);
  assert.equal((await api.list()).length, 2);
});

test('content-script reads never write legacy migration data', async () => {
  const { api, data, local } = setup({ address: { city: address.city, street: address.street, house: address.house } });
  local.set = async () => { throw new Error('Content scripts must not migrate storage'); };
  assert.equal(await api.forPage('https://www.dtek-krem.com.ua/ua/shutdowns'), null);
  assert.equal(data.addresses, undefined);
});
