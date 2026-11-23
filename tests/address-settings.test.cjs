const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const sitesSource = readFileSync(require.resolve('../dtek-sites.js'), 'utf8');
const scheduleSource = readFileSync(require.resolve('../dtek-schedule.js'), 'utf8');
const source = readFileSync(require.resolve('../address-settings.js'), 'utf8');
const address = { region: 'krem', city: 'Тестове місто', street: 'Тестова вулиця', house: '12 А' };
function setup(initial = {}, now = Date.now()) {
  const data = structuredClone(initial);
  const local = { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } };
  let queue = Promise.resolve();
  const navigator = { locks: { request(_name, work) { const operation = queue.then(work); queue = operation.catch(() => {}); return operation; } } };
  const api = vm.runInNewContext(i18nFixtureSource() + '\n' + sitesSource + '\n' + scheduleSource + '\n' + source + '\nAddressSettings;', {
    chrome: { storage: { local } }, crypto: webcrypto, URL, URLSearchParams, navigator,
    Date: class extends Date { static now() { return now; } }
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
  assert.equal((await api.forPage(base, second.id)).id, second.id);
  assert.equal(await api.forPage(base, other.id), null);
  assert.equal(await api.forPage(base, 'deleted'), null);
  await api.remove(second.id);
  assert.equal(await api.forPage(base, second.id), null);
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

test('offers closing only after a detected popup and stops after enabling', async () => {
  const { api, data, local } = setup();
  assert.equal(await api.shouldOfferPopupClosing(), false);
  await api.recordPopupDetection();
  assert.equal(await api.shouldOfferPopupClosing(), true);
  local.set = async () => { throw new Error('Duplicate detection write'); };
  await api.recordPopupDetection();
  local.set = async value => Object.assign(data, value);
  await api.savePreferences({ autoClosePopups: true });
  assert.equal(await api.shouldOfferPopupClosing(), false);
  await api.recordPopupDetection();
  assert.equal(data.popupOfferPending, false);
  await api.savePreferences({ autoClosePopups: false });
  assert.equal(await api.shouldOfferPopupClosing(), false);
});

test('refusing an offer suppresses detections for 31 days and requires a new detection', async () => {
  const now = Date.UTC(2026, 0, 31, 12);
  const first = setup({ popupOfferPending: true }, now);
  await first.api.dismissPopupOffer();
  assert.equal(first.data.popupOfferDismissedAt, now);
  assert.equal(await first.api.shouldOfferPopupClosing(), false);
  const day = 24 * 60 * 60 * 1000;
  for (const elapsed of [1, 28 * day, 30 * day, 31 * day - 1]) {
    const { api, data } = setup(first.data, now + elapsed);
    await api.recordPopupDetection();
    assert.equal(data.popupOfferPending, false);
    assert.equal(await api.shouldOfferPopupClosing(), false);
  }
  const later = setup(first.data, now + 31 * day);
  assert.equal(await later.api.shouldOfferPopupClosing(), false);
  await later.api.recordPopupDetection();
  assert.equal(await later.api.shouldOfferPopupClosing(), true);
});

test('stores a queue and preserves it when saving the same address', async () => {
  const { api } = setup();
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '4.2');
  assert.equal((await api.list())[0].queue, '4.2');
  await api.upsert(address, saved.id);
  assert.equal((await api.list())[0].queue, '4.2');
  await api.upsert({ ...address, house: '23' }, saved.id);
  assert.equal((await api.list())[0].queue, undefined);
});

test('queue updates never overwrite an edited or deleted address', async () => {
  const { api } = setup();
  const original = await api.upsert(address);
  await api.upsert({ ...address, street: 'Інша вулиця' }, original.id);
  await api.saveQueue(original, '2.1');
  assert.equal((await api.list())[0].queue, undefined);
  await api.remove(original.id);
  await api.saveQueue(original, '2.1');
  assert.equal((await api.list()).length, 0);
});

test('supports multiple queues, removes obsolete queues and rejects invalid values', async () => {
  const { api } = setup();
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '1.1, 3.2');
  assert.equal((await api.list())[0].queue, '1.1, 3.2');
  await api.saveQueue(saved, '4.2');
  assert.equal((await api.list())[0].queue, '4.2');
  await api.saveQueue(saved, '2.1');
  assert.equal((await api.list())[0].queue, '2.1');
  await api.saveQueue(saved, '');
  assert.equal((await api.list())[0].queue, undefined);
  await assert.rejects(api.saveQueue(saved, '<b>4.2</b>'), /Некоректна черга/);
});

test('replaces a changed daily schedule even if the queue stays the same', async () => {
  const { api } = setup({}, Date.UTC(2026, 10, 15, 12));
  const saved = await api.upsert(address);
  const original = { date: '2026-11-15', lines: [[[150, 780]]] };
  const updated = { date: '2026-11-15', lines: [[[180, 810], [1200, 1440]]] };
  await api.saveQueue(saved, '4.2', original);
  assert.deepEqual(plain((await api.list())[0].schedules[original.date]), { ...original, queue: '4.2' });
  await api.saveQueue(saved, '4.2', updated);
  assert.deepEqual(plain((await api.list())[0].schedules[updated.date]), { ...updated, queue: '4.2' });
  await api.upsert(address, saved.id);
  assert.deepEqual(plain((await api.list())[0].schedules[updated.date]), { ...updated, queue: '4.2' });
  await api.upsert({ ...address, house: '23' }, saved.id);
  assert.equal((await api.list())[0].schedules, undefined);
});

test('unavailable schedules preserve the last known data and an all-clear day stays distinct', async () => {
  const { api } = setup({}, Date.UTC(2026, 10, 15, 12));
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '4.2', { date: '2026-11-15', lines: [[[0, 1440]]] });
  await api.saveQueue(saved, '4.2', { date: '2026-11-15', lines: [[]] });
  assert.deepEqual(plain((await api.list())[0].schedules['2026-11-15'].lines), [[]]);
  await api.saveQueue(saved, '4.2', null);
  assert.deepEqual(plain((await api.list())[0].schedules['2026-11-15'].lines), [[]]);
  await assert.rejects(api.saveQueue(saved, '4.2', { date: '2026-11-15', lines: [[[0, 1500]]] }), /Некоректний графік/);
});

test('migrates a single saved day into history with the queue for that day', async () => {
  const schedule = { date: '2026-11-14', lines: [[[150, 780]]] };
  const { api } = setup({ addresses: [{ ...address, id: 'saved', queue: '4.2', schedule }] });
  const saved = (await api.list())[0];
  assert.deepEqual(plain(saved.schedules), { '2026-11-14': { ...schedule, queue: '4.2' } });
  assert.equal(saved.schedule, undefined);
});

test('updating today preserves other days and their historical queues', async () => {
  const { api } = setup({}, Date.UTC(2026, 10, 15, 12));
  const saved = await api.upsert(address);
  const yesterday = { date: '2026-11-14', lines: [[[60, 120]]] };
  const today = { date: '2026-11-15', lines: [[[150, 780]]] };
  const tomorrow = { date: '2026-11-16', lines: [[]] };
  await api.saveQueue(saved, '4.2', yesterday);
  await api.saveQueue(saved, '4.2', today, [today, tomorrow]);
  const updated = { ...today, lines: [[[180, 810]]] };
  await api.saveQueue(saved, '5.2', updated);
  const history = plain((await api.list())[0].schedules);
  assert.deepEqual(history['2026-11-14'], { ...yesterday, queue: '4.2' });
  assert.deepEqual(history['2026-11-15'], { ...updated, queue: '5.2' });
  assert.deepEqual(history['2026-11-16'], { ...tomorrow, queue: '4.2' });
});

test('missing current-day data never deletes archived days', async () => {
  const { api } = setup({}, Date.UTC(2026, 10, 15, 12));
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '4.2', { date: '2026-11-14', lines: [[[0, 60]]] });
  await api.saveQueue(saved, '4.2', { date: '2026-11-15', lines: [[[0, 1440]]] });
  await api.saveQueue(saved, '4.2', null);
  assert.deepEqual(plain((await api.list())[0].schedules['2026-11-15'].lines), [[[0, 1440]]]);
  assert.deepEqual(plain((await api.list())[0].schedules['2026-11-14'].lines), [[[0, 60]]]);
});

test('concurrent day updates preserve history and a different household starts with its own archive', async () => {
  const { api } = setup();
  const saved = await api.upsert(address);
  await Promise.all([
    api.saveQueue(saved, '4.2', { date: '2026-11-14', lines: [[]] }),
    api.saveQueue(saved, '4.2', { date: '2026-11-15', lines: [[]] })
  ]);
  assert.equal(Object.keys((await api.list())[0].schedules).length, 2);
  await api.upsert({ ...address, house: '23' }, saved.id);
  assert.equal((await api.list())[0].schedules, undefined);
});

test('a stale page cannot overwrite a past day while current and future days can change', async () => {
  const { api } = setup({}, Date.UTC(2026, 10, 15, 12));
  const saved = await api.upsert(address);
  const past = { date: '2026-11-14', lines: [[[60, 120]]] };
  const future = { date: '2026-11-16', lines: [[[60, 120]]] };
  await api.saveQueue(saved, '4.2', past, [future]);
  await api.saveQueue(saved, '5.2', { ...past, lines: [[[0, 1440]]] }, [{ ...future, lines: [[]] }]);
  const history = (await api.list())[0].schedules;
  assert.deepEqual(plain(history[past.date]), { ...past, queue: '4.2' });
  assert.deepEqual(plain(history[future.date]), { ...future, lines: [[]], queue: '5.2' });
});

test('migrates embedded schedules to independent archives without data loss', async () => {
  const schedule = { date: '2026-11-14', lines: [[[60, 120]]] };
  const { api, data } = setup({ addresses: [{ id: 'old', ...address, queue: '5.2', schedule }] });
  const result = (await api.list())[0];
  assert.deepEqual(plain(result.schedules[schedule.date]), { ...schedule, queue: '5.2' });
  assert.deepEqual(data.addresses, [{ id: 'old', ...address }]);
  assert.equal(Object.keys(data.addressArchives).length, 1);
  assert.deepEqual(Object.values(data.addressArchives)[0].schedules[schedule.date], { ...schedule, queue: '5.2' });
});

test('removing and re-adding an address restores history after restart with a new profile ID', async () => {
  const initial = setup();
  const saved = await initial.api.upsert(address);
  const schedule = { date: '2026-11-14', lines: [[[150, 780]]] };
  await initial.api.saveQueue(saved, '5.2', schedule);
  await initial.api.remove(saved.id);
  assert.deepEqual(plain(await initial.api.list()), []);
  const restarted = setup(initial.data);
  const restored = await restarted.api.upsert({ ...address, city: ' ТЕСТОВЕ  МІСТО ', street: ' ТЕСТОВА  ВУЛИЦЯ ', house: '12А' });
  assert.notEqual(restored.id, saved.id);
  assert.equal(restored.queue, '5.2');
  assert.deepEqual(plain(restored.schedules[schedule.date]), { ...schedule, queue: '5.2' });
  assert.equal(await restarted.api.forPage('https://www.dtek-krem.com.ua/ua/shutdowns', saved.id), null);
});

test('explicit archive deletion removes only that address history and late updates cannot resurrect it', async () => {
  const { api, data } = setup();
  const first = await api.upsert(address);
  const second = await api.upsert({ ...address, house: '23' });
  const schedule = { date: '2026-11-14', lines: [[[60, 120]]] };
  await api.saveQueue(first, '5.2', schedule);
  await api.saveQueue(second, '4.2', schedule);
  await api.remove(first.id, { deleteArchive: true });
  const restored = await api.upsert(address);
  assert.equal(restored.schedules, undefined);
  assert.equal(restored.queue, undefined);
  await api.saveQueue(first, '5.2', schedule);
  const current = await api.list();
  assert.equal(current.find(item => item.id === restored.id).schedules, undefined);
  assert.equal(current.find(item => item.id === second.id).schedules[schedule.date].queue, '4.2');
  assert.equal(Object.keys(data.addressArchives).length, 1);
});

test('editing away and back restores each household archive independently', async () => {
  const { api } = setup();
  const first = await api.upsert(address);
  const schedule = { date: '2026-11-14', lines: [[[60, 120]]] };
  await api.saveQueue(first, '5.2', schedule);
  const second = await api.upsert({ ...address, house: '23' }, first.id);
  assert.equal(second.schedules, undefined);
  await api.saveQueue(second, '4.2', { ...schedule, lines: [[]] });
  const restored = await api.upsert(address, first.id);
  assert.equal(restored.schedules[schedule.date].queue, '5.2');
  assert.deepEqual(plain(restored.schedules[schedule.date].lines), [[[60, 120]]]);
  const restoredSecond = await api.upsert({ ...address, house: '23' }, first.id);
  assert.deepEqual(plain(restoredSecond.schedules[schedule.date].lines), [[]]);
});

test('archive identity preserves distinctions between regions, settlements, streets and house separators', async () => {
  const { api } = setup();
  const saved = await api.upsert({ ...address, house: '17/1' });
  await api.saveQueue(saved, '5.2', { date: '2026-11-14', lines: [[]] });
  await api.remove(saved.id);
  for (const value of [{ ...address, house: '171' }, { ...address, house: '17-1' },
    { ...address, house: '17/1', region: 'oem' }, { ...address, house: '17/1', city: 'Інше місто' },
    { ...address, house: '17/1', street: 'Інша вулиця' }]) {
    const fresh = await api.upsert(value);
    assert.equal(fresh.schedules, undefined);
  }
});

test('purge failure leaves both the profile and archive intact', async () => {
  const { api, data, local } = setup();
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '5.2', { date: '2026-11-14', lines: [[]] });
  const before = structuredClone(data);
  local.set = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(api.remove(saved.id, { deleteArchive: true }), /Storage unavailable/);
  assert.deepEqual(data, before);
});

test('corrupt archive roots are reported without overwriting them', async () => {
  for (const value of [null, [], 'corrupt']) {
    const { api, data } = setup({ addressArchives: value });
    await assert.rejects(api.list(), /архів/);
    await assert.rejects(api.upsert(address), /архів/);
    assert.deepEqual(data.addressArchives, value);
  }
});

test('migration merges older embedded days without overwriting an existing archived day', async () => {
  const { api, data } = setup();
  const saved = await api.upsert(address);
  const archived = { date: '2026-11-14', lines: [[[60, 120]]] };
  await api.saveQueue(saved, '5.2', archived);
  data.addresses[0].queue = '1.1';
  data.addresses[0].schedules = {
    '2026-11-14': { ...archived, lines: [[]], queue: '1.1' },
    '2026-11-13': { date: '2026-11-13', lines: [[]], queue: '1.1' }
  };
  const migrated = (await api.list())[0];
  assert.deepEqual(plain(migrated.schedules['2026-11-14']), { ...archived, queue: '5.2' });
  assert.equal(migrated.schedules['2026-11-13'].queue, '1.1');
  assert.equal(data.addresses[0].schedules, undefined);
});
