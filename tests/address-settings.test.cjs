const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { fixtureState } = require('./storage-fixture.cjs');
const source = ['dtek-sites.js', 'dtek-schedule.js', 'address-identity.js', 'address-settings.js'].map(file => readFileSync(require.resolve('../' + file), 'utf8')).join('\n');
const address = { region: 'krem', city: 'Обухів', street: 'Миру', house: '17' };
const today = '2026-11-25';
const day = (date = today, lines = [[[60, 120]]]) => ({ date, lines });
function setup(initial = {}, now = Date.UTC(2026, 10, 25, 12)) {
  const data = structuredClone(initial);
  const local = { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } };
  let queue = Promise.resolve();
  const navigator = { locks: { request(_name, work) { const operation = queue.then(work); queue = operation.catch(() => {}); return operation; } } };
  const api = vm.runInNewContext(i18nFixtureSource() + '\n' + source + '\nAddressSettings;', {
    chrome: { storage: { local } }, crypto: webcrypto, URL, navigator,
    Date: class extends Date { static now() { return now; } }
  });
  return { api, data, local };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('fresh profile starts empty; creating addresses writes an atomic versioned state', async () => {
  const { api, data } = setup({ interfaceLanguage: 'uk' });
  assert.deepEqual(plain(await api.list()), []);
  const first = await api.upsert(address);
  const second = await api.upsert({ ...address, house: '23' });
  assert.notEqual(first.id, second.id);
  assert.equal(first.revision, 1);
  assert.equal(data.scheduleData.schemaVersion, 1);
  assert.equal(data.interfaceLanguage, 'uk');
  assert.equal(data.addresses, undefined);
});
test('invalid addresses, duplicate addresses and missing edited records are rejected', async () => {
  const { api } = setup();
  await api.upsert(address);
  await assert.rejects(api.upsert({ ...address, city: ' ОБУХІВ ' }), /вже додано/);
  for (const value of [{}, null, { ...address, street: '' }, { ...address, region: 'unknown' }]) await assert.rejects(api.upsert(value));
  await assert.rejects(api.upsert(address, 'missing'), /видалено/);
});
test('Kyiv fixes settlement and whitespace is normalized', async () => {
  const { api } = setup();
  const saved = await api.upsert({ ...address, region: 'kem', city: '', house: ' 12   А ' });
  assert.equal(saved.city, 'Київ'); assert.equal(saved.house, '12 А');
});
test('unsupported old data is never overwritten or treated as empty', async () => {
  for (const initial of [{ addresses: [address] }, { address }, { addresses: 'bad' }, { addressArchives: { old: {} } }]) {
    const { api, data } = setup(initial); const before = JSON.stringify(data);
    await assert.rejects(api.list(), /не підтримується/);
    await assert.rejects(api.upsert(address));
    assert.equal(JSON.stringify(data), before);
  }
});
test('unknown schema, corrupt references and personal data in archives fail without writes', async () => {
  const base = fixtureState([{ id: 'one', ...address, queue: '4.2', schedule: day() }]);
  for (const corrupt of [s => s.schemaVersion = 900, s => Object.values(s.archives)[0].street = 'secret',
    s => s.histories.one[today].snapshotId = 'missing', s => s.addresses[0].revision = 0,
    s => s.localities = null, s => Object.values(s.archives)[0].days[today][0].queue = '2.1']) {
    const state = structuredClone(base); corrupt(state);
    const { api, data } = setup({ scheduleData: state }); const before = JSON.stringify(data);
    await assert.rejects(api.list()); await assert.rejects(api.remove('one'));
    assert.equal(JSON.stringify(data), before);
  }
});
test('saving schedules keeps full address exclusively in the profile', async () => {
  const { api, data } = setup(); const saved = await api.upsert(address);
  await api.saveQueue(saved, '4.2', day());
  const state = data.scheduleData;
  assert.equal(state.addresses[0].street, address.street);
  const nonProfiles = JSON.stringify({ ...state, addresses: [] });
  assert.ok(!nonProfiles.includes(address.street));
  assert.ok(!nonProfiles.includes('"house"')); assert.ok(!nonProfiles.includes('"street"'));
  assert.equal(Object.keys(state.archives).length, 1);
  assert.deepEqual(plain((await api.list())[0].schedules[today]), { ...day(), queue: '4.2' });
});
test('corrections retain ID/history and revision rejects even edit-away-and-back responses', async () => {
  const { api } = setup(); const original = await api.upsert(address);
  await api.saveQueue(original, '4.2', day());
  const corrected = await api.upsert({ ...address, city: 'м. Обухів', street: 'вул. Миру' }, original.id);
  assert.equal(corrected.id, original.id); assert.equal(corrected.localityId, original.localityId);
  assert.equal(corrected.queueVerified, true); assert.equal(corrected.queue, '4.2');
  assert.deepEqual(plain(corrected.schedules[today]), { ...day(), queue: '4.2' });
  const back = await api.upsert(address, original.id);
  await api.saveQueue(original, '9.1', day(today, [[]]));
  assert.equal((await api.list())[0].queue, '4.2');
  await api.saveQueue(back, '5.2', day(today, [[]]));
  assert.equal((await api.list())[0].queue, '5.2');
});
test('unchanged saving does not invalidate the page revision', async () => {
  const { api } = setup(); const original = await api.upsert(address);
  const same = await api.upsert(address, original.id);
  assert.equal(same.revision, original.revision);
  await api.saveQueue(original, '4.2', day());
  assert.equal((await api.list())[0].queue, '4.2');
});
test('different-address action creates a new ID and keeps only shared archives', async () => {
  const { api } = setup(); const old = await api.upsert(address);
  await api.saveQueue(old, '4.2', day());
  const fresh = await api.upsert({ ...address, house: '23' }, old.id, { newIdentity: true });
  assert.notEqual(old.id, fresh.id); assert.equal(fresh.schedules, undefined);
  await api.saveQueue(old, '4.2', day(today, [[]]));
  assert.equal((await api.archives())[0].days[today].length, 1);
});
test('deleting an address removes identifying data and keeps archives after restart', async () => {
  const initial = setup(); const old = await initial.api.upsert(address);
  await initial.api.saveQueue(old, '4.2', day()); await initial.api.remove(old.id);
  const text = JSON.stringify(initial.data);
  assert.ok(!text.includes('"street"')); assert.ok(!text.includes('"house"')); assert.ok(!text.includes(old.id));
  const restarted = setup(initial.data);
  assert.equal((await restarted.api.archives()).length, 1);
  const fresh = await restarted.api.upsert(address);
  assert.equal(fresh.schedules, undefined);
  await restarted.api.saveQueue(fresh, '4.2');
  assert.deepEqual(plain((await restarted.api.list())[0].schedules[today]), { ...day(), queue: '4.2' });
});
test('two addresses share identical snapshots but conflicting data never overwrites either history', async () => {
  const { api } = setup(); const first = await api.upsert(address); const second = await api.upsert({ ...address, house: '23' });
  await api.saveQueue(first, '4.2', day()); await api.saveQueue(second, '4.2', day());
  assert.equal((await api.archives())[0].days[today].length, 1);
  await api.saveQueue(second, '4.2', day(today, [[]]));
  const profiles = await api.list();
  assert.deepEqual(plain(profiles[0].schedules[today].lines), [[[60, 120]]]);
  assert.deepEqual(plain(profiles[1].schedules[today].lines), [[]]);
  assert.equal((await api.archives())[0].days[today].length, 2);
  assert.equal((await api.archives())[0].addressCount, 2);
});
test('ambiguous shared days are not silently restored for a new address', async () => {
  const { api } = setup(); const first = await api.upsert(address);
  await api.saveQueue(first, '4.2', day()); await api.saveQueue(first, '4.2', day(today, [[]]));
  await api.remove(first.id);
  const other = await api.upsert(address); await api.saveQueue(other, '4.2');
  assert.equal((await api.list())[0].schedules, undefined);
});
test('group and region changes preserve historical group snapshots', async () => {
  const { api } = setup(); const a = await api.upsert(address);
  await api.saveQueue(a, '4.2', day('2026-11-24'));
  await api.saveQueue(a, '5.2', day());
  const current = (await api.list())[0];
  assert.equal(current.schedules['2026-11-24'].queue, '4.2'); assert.equal(current.schedules[today].queue, '5.2');
  const edited = await api.upsert({ ...address, region: 'oem' }, a.id);
  await api.saveQueue(edited, '5.2', day());
  assert.equal((await api.archives()).length, 3);
});
test('unknown groups and combined lines survive without guessed line-group mapping', async () => {
  const { api } = setup(); const a = await api.upsert(address);
  await api.saveQueue(a, '1.1, 3.2', day(today, [[], [[30, 60]]]));
  await api.saveQueue(a, '', day('2026-11-26'));
  const groups = await api.archives();
  assert.equal(groups.length, 2);
  assert.equal(groups.find(item => item.queue === '1.1, 3.2').days[today][0].lines.length, 2);
  assert.equal((await api.list())[0].queueVerified, false);
});
test('past snapshots are immutable; missing data preserves the latest known schedule', async () => {
  const { api } = setup(); const a = await api.upsert(address);
  await api.saveQueue(a, '4.2', day('2026-11-24'));
  await api.saveQueue(a, '5.2', day('2026-11-24', [[]]));
  await api.saveQueue(a, '');
  assert.equal((await api.list())[0].schedules['2026-11-24'].queue, '4.2');
});
test('deleting shared archives removes every reference, invalidates old tabs and preserves unrelated data', async () => {
  const { api } = setup(); const a = await api.upsert(address); const b = await api.upsert({ ...address, house: '23' });
  await api.saveQueue(a, '4.2', day()); await api.saveQueue(b, '4.2', day());
  await api.saveQueue(a, '5.2', day('2026-11-26'));
  const target = (await api.archives()).find(item => item.queue === '4.2');
  await api.removeArchive(target.id);
  const profiles = await api.list();
  assert.ok(profiles.every(item => !item.schedules?.[today]));
  assert.ok(profiles[0].schedules['2026-11-26']);
  await api.saveQueue(b, '4.2', day());
  assert.ok(!(await api.archives()).some(item => item.id === target.id));
  assert.equal((await api.archives()).length, 1);
});
test('storage failures never pretend success or partially erase state', async () => {
  const { api, data, local } = setup(); const a = await api.upsert(address); await api.saveQueue(a, '4.2', day());
  const archive = (await api.archives())[0]; const before = JSON.stringify(data);
  local.set = async () => { throw Error('Storage unavailable'); };
  await assert.rejects(api.remove(a.id)); await assert.rejects(api.removeArchive(archive.id));
  await assert.rejects(api.upsert({ ...address, house: '23' }));
  assert.equal(JSON.stringify(data), before);
});
test('concurrent writes from popups and worker preserve both addresses and schedules', async () => {
  const { api } = setup();
  const [a, b] = await Promise.all([api.upsert(address), api.upsert({ ...address, house: '23' })]);
  await Promise.all([api.saveQueue(a, '4.2', day()), api.saveQueue(b, '5.2', day())]);
  assert.equal((await api.list()).length, 2); assert.equal((await api.archives()).length, 2);
});
test('page selection remains region-specific; deleted explicit IDs never fall back', async () => {
  const { api } = setup(); const a = await api.upsert(address); const b = await api.upsert({ ...address, house: '23' });
  const url = 'https://www.dtek-krem.com.ua/ua/shutdowns';
  assert.equal((await api.forPage(url, b.id)).id, b.id); await api.remove(b.id);
  assert.equal(await api.forPage(url, b.id), null); assert.equal((await api.forPage(url)).id, a.id);
  assert.equal(await api.forPage('https://www.dtek-oem.com.ua/ua/shutdowns', a.id), null);
});
test('read-only calls never write or migrate storage', async () => {
  const { api, local } = setup({ scheduleData: fixtureState([{ id: 'test', ...address }]) });
  local.set = async () => { throw Error('Unexpected write'); };
  assert.equal((await api.forPage('https://www.dtek-krem.com.ua/ua/shutdowns')).id, 'test');
  await api.archives();
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


test('correcting a misspelled locality retains its ID and aliases for future verified archive reuse', async () => {
  const { api } = setup(); const old = await api.upsert({ ...address, city: 'Обухівв' });
  await api.saveQueue(old, '4.2', day());
  const corrected = await api.upsert(address, old.id);
  assert.equal(corrected.localityId, old.localityId);
  const archive = (await api.archives())[0];
  assert.equal(archive.locality.name, 'Обухів');
  assert.ok(archive.locality.aliases.includes('Обухівв'));
  await api.remove(old.id);
  const another = await api.upsert(address); await api.saveQueue(another, '4.2');
  assert.ok((await api.list())[0].schedules[today]);
});

test('explicit city/village names remain distinct and ambiguous short names are rejected', async () => {
  const { api } = setup();
  const city = await api.upsert({ ...address, city: 'м. Тестове' });
  const village = await api.upsert({ ...address, city: 'с. Тестове' });
  assert.notEqual(city.localityId, village.localityId);
  await api.saveQueue(city, '4.2', day()); await api.saveQueue(village, '4.2', day());
  assert.equal((await api.archives()).length, 2);
  await assert.rejects(api.upsert({ ...address, city: 'Тестове', house: '99' }), /кілька населених пунктів/);
});

test('mixed storage formats block all archive writes', async () => {
  const { api, data } = setup({ scheduleData: fixtureState([{ id: 'one', ...address }]), addresses: [{ ...address, id: 'one' }] });
  const before = JSON.stringify(data);
  await assert.rejects(api.list(), /не підтримується/); await assert.rejects(api.remove('one'));
  assert.equal(JSON.stringify(data), before);
});

test('editing another street never reverts a shared locality name to an old alias', async () => {
  const { api } = setup();
  const first = await api.upsert({ ...address, city: 'Обухівв' });
  const second = await api.upsert({ ...address, city: 'Обухівв', house: '23' });
  await api.saveQueue(first, '4.2', day());
  await api.upsert(address, first.id);
  await api.upsert({ ...address, city: 'Обухівв', street: 'вул. Миру', house: '23' }, second.id);
  assert.equal((await api.archives())[0].locality.name, 'Обухів');
});

test('a confirmed edit cannot overwrite a newer profile revision', async () => {
  const { api, data } = setup(); const original = await api.upsert(address);
  await api.upsert({ ...address, house: '18' }, original.id);
  const before = JSON.stringify(data);
  for (const newIdentity of [false, true]) {
    await assert.rejects(api.upsert({ ...address, house: '19' }, original.id, { expectedRevision: original.revision, newIdentity }), /іншому вікні/);
    assert.equal(JSON.stringify(data), before);
  }
});

test('changing only building case keeps the confirmed queue and history but rejects stale tab writes', async () => {
  const { api } = setup(); const original = await api.upsert({ ...address, house: '17 А' });
  await api.saveQueue(original, '4.2', day());
  const edited = await api.upsert({ ...address, house: '17 а' }, original.id);
  assert.equal(edited.queueVerified, true); assert.equal(edited.queue, '4.2');
  assert.equal(edited.id, original.id); assert.equal(edited.revision, original.revision + 1);
  assert.deepEqual(plain(edited.schedules[today]), { ...day(), queue: '4.2' });
  await api.saveQueue(original, '9.1', day(today, [[]]));
  assert.equal((await api.list())[0].queue, '4.2');
  const changed = await api.upsert({ ...address, house: '17 Б' }, original.id);
  assert.equal(changed.queueVerified, false); assert.equal(changed.queue, '');
});


test('365-day default expires all versions and history references by schedule date, preserving boundary and future dates', async () => {
  const base = fixtureState([
    { id: 'one', ...address, queue: '4.2', schedules: {
      '2025-11-25': day('2025-11-25'), '2025-11-26': day('2025-11-26'), '2026-11-26': day('2026-11-26')
    } },
    { id: 'two', ...address, house: '23', queue: '4.2', schedule: day('2025-11-25', [[]]) },
    { id: 'three', ...address, house: '24', queue: '5.2', schedule: day('2025-11-25') }
  ]);
  const { api, data } = setup({ scheduleData: base });
  assert.equal((await api.loadPreferences()).archiveRetentionDays, 365);
  const archives = await api.archives();
  assert.equal(archives.length, 1);
  assert.deepEqual(Object.keys(archives[0].days), ['2025-11-26', '2026-11-26']);
  assert.deepEqual(Object.keys(data.scheduleData.histories.one), ['2025-11-26', '2026-11-26']);
  assert.deepEqual(data.scheduleData.histories.two, {});
  assert.deepEqual(data.scheduleData.histories.three, {});
  assert.equal(data.scheduleData.addresses[1].queueVerified, true);
  assert.equal(data.scheduleData.addresses[1].revision, 1);
  await api.saveQueue((await api.list())[0], '4.2', day('2025-11-25'));
  assert.equal((await api.archives())[0].days['2025-11-25'], undefined);
});

test('retention and pruning commit atomically, preserve unrelated preferences, and apply after restart', async () => {
  const { api, data, local } = setup({ autoClosePopups: true });
  const saved = await api.upsert(address);
  await api.saveQueue(saved, '4.2', day('2026-11-24'));
  await api.saveQueue(saved, '4.2', day());
  const before = JSON.stringify(data);
  const write = local.set;
  local.set = async () => { throw Error('Storage unavailable'); };
  await assert.rejects(api.savePreferences({ archiveRetentionDays: 1 }));
  assert.equal(JSON.stringify(data), before);
  local.set = write;
  await api.savePreferences({ archiveRetentionDays: 1 });
  assert.equal(data.autoClosePopups, true);
  assert.deepEqual(Object.keys(data.scheduleData.histories[saved.id]), [today]);
  await api.savePreferences({ autoClosePopups: false });
  assert.equal(data.archiveRetentionDays, 1);
  const restarted = setup(data, Date.UTC(2026, 10, 26, 12));
  assert.equal((await restarted.api.loadPreferences()).archiveRetentionDays, 1);
  assert.equal((await restarted.api.archives()).length, 0);
  assert.equal((await restarted.api.list())[0].schedules, undefined);
});

test('invalid retention periods fail without writes and invalid stored preferences fall back to 365 days', async () => {
  const { api, data } = setup({ archiveRetentionDays: 90 });
  const before = JSON.stringify(data);
  for (const days of [0, -1, 1.2, NaN, Infinity, null, '30', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.savePreferences({ archiveRetentionDays: days }));
    assert.equal(JSON.stringify(data), before);
    assert.equal((await setup({ archiveRetentionDays: days }).api.loadPreferences()).archiveRetentionDays, 365);
  }
});

test('existing Kyiv archives get the canonical city name without changing schedules or address links', async () => {
  const state = fixtureState([{ id: 'kyiv', ...address, region: 'kem', city: 'Київ', queue: '4.2', schedule: day() },
    { id: 'regional', ...address, city: 'обухів', queue: '5.2', schedule: day() }]);
  const place = Object.values(state.localities).find(item => item.region === 'kem');
  place.name = 'київ';
  const original = structuredClone(state);
  const { api, data, local } = setup({ scheduleData: state });
  const archives = await api.archives();
  assert.equal(archives.find(item => item.locality.region === 'kem').locality.name, 'Київ');
  assert.equal(archives.find(item => item.locality.region === 'krem').locality.name, 'обухів');
  assert.equal(data.scheduleData.localities[place.id].name, 'Київ');
  assert.deepEqual(data.scheduleData.localities[place.id].aliases, ['київ']);
  for (const key of ['addresses', 'archives', 'histories']) assert.deepEqual(data.scheduleData[key], original[key]);
  local.set = async () => { throw Error('Unexpected repeated write'); };
  assert.equal((await api.archives()).find(item => item.locality.region === 'kem').locality.name, 'Київ');
  assert.equal((await api.list())[0].schedules[today].date, today);
});
