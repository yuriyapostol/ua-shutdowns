const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = ['dtek-sites.js', 'dtek-schedule.js', 'address-settings.js', 'address-navigation.js']
  .map(file => readFileSync(require.resolve('../' + file), 'utf8')).join('\n');
const address = { id: 'second', region: 'oem', city: 'Тестове місто', street: 'Тестова', house: '12' };
const first = { ...address, id: 'first', house: '1' };
const target = 'https://www.dtek-oem.com.ua/ua/shutdowns';
const key = id => `address-for-tab:${id}`;

function page(tab, initial = {}) {
  const calls = [];
  const session = structuredClone(initial);
  const addresses = [first, address];
  const selected = [];
  const chrome = { storage: {
    local: { async get() { return { addresses }; } },
    session: {
      async get() { return structuredClone(session); },
      async set(value) { Object.assign(session, structuredClone(value)); },
      async remove(name) { delete session[name]; }
    }
  }, runtime: { async sendMessage(message) { calls.push(message); return { ok: true }; } }, tabs: {
    async query() { return tab ? [tab] : []; },
    async create(options) { calls.push({ type: 'create', ...options }); return { id: 9 }; },
    async update(id, options) {
      calls.push({ type: 'update', id, ...options });
      selected.push(await api.forTab(id, options.url));
    },
    async reload(id) {
      calls.push({ type: 'reload', id });
      selected.push(await api.forTab(id, tab.url));
    },
    async remove(id) { calls.push({ type: 'remove', id }); }
  } };
  const api = vm.runInNewContext(source + '\nAddressNavigation;', { URL, chrome, console });
  return { api, calls, session, selected, chrome, addresses };
}

test('opens a clean URL and stores the selection before a new page can read it', async () => {
  const p = page({ id: 1, url: 'https://example.com' });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [
    { type: 'create', url: 'about:blank' }, { type: 'update', id: 9, url: target }
  ]);
  assert.equal(p.selected[0].id, address.id);
  assert.deepEqual(p.session[key(9)], { id: address.id, region: address.region });
  assert.equal(new URL(p.calls[1].url).hash, '');
  assert.equal(new URL(p.calls[1].url).search, '');
});

test('reuses a current DTEK tab even for a different region', async () => {
  const p = page({ id: 4, url: 'https://www.dtek-krem.com.ua/ua/shutdowns' });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [{ type: 'update', id: 4, url: target }]);
  assert.equal(p.selected[0].id, address.id);
});

test('selecting another address on the same clean URL stores it before reloading', async () => {
  const p = page({ id: 4, url: target }, { [key(4)]: { id: first.id, region: first.region } });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [{ type: 'reload', id: 4 }]);
  assert.equal(p.selected[0].id, address.id);
  assert.equal((await p.api.forTab(4, target)).id, address.id);
});

test('clicking the same address again reloads the page with its selection', async () => {
  const p = page({ id: 4, url: target }, { [key(4)]: { id: address.id, region: address.region } });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [{ type: 'reload', id: 4 }]);
  assert.equal(p.selected[0].id, address.id);
});

test('old service fragments still trigger a reload rather than a fragment-only navigation', async () => {
  const p = page({ id: 4, url: target + '#ua-shutdowns-address=first' });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [{ type: 'reload', id: 4 }]);
  assert.equal(p.selected[0].id, address.id);
});

test('reuses non-www DTEK tabs and other pages of the regional site', async () => {
  const p = page({ id: 4, url: 'https://dtek-dem.com.ua/ua' });
  await p.api.navigate(address);
  assert.deepEqual(p.calls, [{ type: 'update', id: 4, url: target }]);
});

test('preserves unrelated tabs, lookalike hosts and tabs with unavailable URLs', async () => {
  for (const tab of [{ id: 4, url: 'https://www.dtek-oem.com.ua.evil.example' }, { id: 4 }, undefined]) {
    const p = page(tab);
    await p.api.navigate(address);
    assert.equal(p.calls[0].type, 'create');
    assert.equal(p.calls[1].id, 9);
  }
});

test('an unassigned legacy address cannot open a guessed operator site', async () => {
  const p = page();
  await assert.rejects(p.api.navigate({ ...address, region: '' }), /оберіть регіон/);
  assert.equal(p.calls.length, 0);
});

test('multiple tabs keep independent selections and deleted selections never fall back', async () => {
  const p = page(null, {
    [key(4)]: { id: first.id, region: first.region },
    [key(5)]: { id: address.id, region: address.region }
  });
  assert.equal((await p.api.forTab(4, target)).id, first.id);
  assert.equal((await p.api.forTab(5, target)).id, address.id);
  p.addresses.pop();
  assert.equal(await p.api.forTab(5, target), null);
  assert.equal((await p.api.forTab(4, target)).id, first.id);
});

test('manual pages use the regional default and region mismatches never use another region address', async () => {
  const p = page(null, { [key(4)]: { id: 'different', region: 'krem' } });
  assert.equal((await p.api.forTab(4, target)).id, first.id);
  assert.equal((await p.api.forTab(5, target)).id, first.id);
  assert.equal(await p.api.forTab(5, 'https://example.com'), null);
});

test('migrates old link selections once and keeps a newer internal selection', async () => {
  const p = page();
  assert.equal((await p.api.forTab(4, target, address.id)).id, address.id);
  assert.equal((await p.api.forTab(4, target, first.id)).id, address.id);
  assert.equal((await p.api.forTab(4, target)).id, address.id);
  assert.equal(await p.api.forTab(5, target, 'deleted'), null);
});

test('failed navigation restores the old selection without changing another tab', async () => {
  const initial = { [key(4)]: { id: first.id, region: first.region }, [key(8)]: { id: 'other', region: 'kem' } };
  const p = page({ id: 4, url: target }, initial);
  p.chrome.tabs.reload = async () => { throw new Error('Reload failed'); };
  await assert.rejects(p.api.navigate(address), /Reload failed/);
  assert.deepEqual(p.session, initial);
});

test('storage failures prevent page loading and close only a newly created blank tab', async () => {
  for (const tab of [undefined, { id: 4, url: target }]) {
    const p = page(tab);
    p.chrome.storage.session.set = async () => { throw new Error('Storage unavailable'); };
    await assert.rejects(p.api.navigate(address), /Storage unavailable/);
    assert.deepEqual(p.calls.map(c => c.type), tab ? [] : ['create', 'remove']);
  }
});

test('closed tab cleanup removes only that tab selection', async () => {
  const p = page(null, { [key(4)]: { id: first.id }, [key(5)]: { id: address.id } });
  await p.api.forget(4);
  assert.equal(p.session[key(4)], undefined);
  assert.equal(p.session[key(5)].id, address.id);
});

test('popup delegates opening to the worker and reports its errors', async () => {
  const p = page();
  await p.api.open(address);
  assert.equal(p.calls[0].type, 'open-address');
  assert.equal(p.calls[0].addressId, address.id);
  p.chrome.runtime.sendMessage = async () => ({ ok: false, error: 'Worker navigation failed' });
  await assert.rejects(p.api.open(address), /Worker navigation failed/);
});
