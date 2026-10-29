const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = ['dtek-sites.js', 'address-navigation.js'].map(file=>readFileSync(require.resolve('../'+file),'utf8')).join('\n');
const address = { id: 'opaque-local-id', region: 'oem', city: 'Тестове місто', street: 'Тестова', house: '12' };
function page(tab) {
  const calls = [];
  const listeners = new Set();
  const api = vm.runInNewContext(source + '\nAddressNavigation;', { URL, URLSearchParams, chrome: { tabs: {
    async query() { return tab ? [tab] : []; },
    onUpdated: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
    async update(id, options) {
      calls.push({ type: 'update', id, ...options });
      for (const listener of listeners) listener(id, { url: options.url }, { ...tab, ...options });
    },
    async create(options) { calls.push({ type: 'create', ...options }); },
    async reload(id) { calls.push({ type: 'reload', id }); }
  } }, setTimeout, clearTimeout });
  return { api, calls };
}
test('opens a new tab from an unrelated site and puts only an opaque ID in its URL', async () => {
  const { api, calls } = page({ id: 1, url: 'https://example.com' });
  await api.open(address);
  assert.equal(calls[0].type, 'create');
  const url = new URL(calls[0].url);
  assert.equal(url.hostname, 'www.dtek-oem.com.ua');
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('ua-shutdowns-address'), address.id);
  assert.ok(!decodeURIComponent(url.href).includes(address.street));
});
test('reuses a current DTEK tab even for a different region', async () => {
  const { api, calls } = page({ id: 4, url: 'https://www.dtek-krem.com.ua/ua/shutdowns' });
  await api.open(address);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'update');
  assert.equal(calls[0].id, 4);
});
test('reloads the same document so a fragment change restarts automatic selection', async () => {
  const { api, calls } = page({ id: 4, url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=previous' });
  await api.open(address);
  assert.deepEqual(calls.map(c=>c.type), ['update', 'reload']);
});
test('also reloads when the very same address is clicked again', async () => {
  const { api, calls } = page({ id: 4, url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=opaque-local-id' });
  await api.open(address);
  assert.deepEqual(calls.map(c=>c.type), ['reload']);
});
test('reuses non-www DTEK tabs and other pages of the regional site', async () => {
  const { api, calls } = page({ id: 4, url: 'https://dtek-dem.com.ua/ua' });
  await api.open(address);
  assert.equal(calls[0].type, 'update');
  assert.equal(calls.length, 1);
});
test('does not navigate unrelated similarly named hosts', async () => {
  const { api, calls } = page({ id: 4, url: 'https://www.dtek-oem.com.ua.evil.example' });
  await api.open(address);
  assert.equal(calls[0].type, 'create');
});
test('opens a new tab when the current URL is unavailable', async () => {
  const { api, calls } = page({ id: 4 });
  await api.open(address);
  assert.equal(calls[0].type, 'create');
});
test('an unassigned legacy address cannot open a guessed operator site', async () => {
  const { api, calls } = page();
  await assert.rejects(api.open({ ...address, region: '' }), /оберіть регіон/);
  assert.equal(calls.length, 0);
});

test('waits for the selected address URL to commit before reloading the current tab', async () => {
  const settingsSource = readFileSync(require.resolve('../address-settings.js'), 'utf8');
  const listeners = new Set();
  const actualTab = { id: 4, url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=first' };
  const addresses = [
    { ...address, id: 'first', house: '1' },
    { ...address, id: 'second', house: '2' }
  ];
  let selectedOnReload;
  let reads = 0;
  let api;
  const chrome = {
    storage: { local: { async get() { reads++; return { addresses }; } } },
    tabs: {
      async query() { return [{ ...actualTab }]; },
      onUpdated: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
      async update(id, options) {
        // Chrome can resolve tabs.update before the same-document URL is committed.
        setTimeout(() => {
          actualTab.url = options.url;
          for (const listener of listeners) listener(id, { url: actualTab.url }, { ...actualTab });
        }, 0);
        return { ...actualTab };
      },
      async reload() { selectedOnReload = await api.settings.forPage(actualTab.url); }
    }
  };
  const sitesSource = readFileSync(require.resolve('../dtek-sites.js'), 'utf8');
  const navigationSource = readFileSync(require.resolve('../address-navigation.js'), 'utf8');
  api = vm.runInNewContext(sitesSource + '\n' + settingsSource + '\n' + navigationSource +
    '\n({ settings: AddressSettings, navigation: AddressNavigation });', { chrome, URL, URLSearchParams, setTimeout, clearTimeout });
  await api.navigation.open(addresses[1]);
  assert.equal(selectedOnReload.id, 'second');
  assert.equal(selectedOnReload.house, '2');
  assert.equal(reads, 1);
  assert.equal(listeners.size, 0);
});

test('failed navigation releases its listener without reloading the previous address', async () => {
  const listeners = new Set();
  let reloads = 0;
  const api = vm.runInNewContext(source + '\nAddressNavigation;', { URL, URLSearchParams, setTimeout, clearTimeout,
    chrome: { tabs: {
      async query() { return [{ id: 4, url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=first' }]; },
      onUpdated: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
      async update() { throw new Error('Navigation failed'); },
      async reload() { reloads++; }
    } }
  });
  await assert.rejects(api.open(address), /Navigation failed/);
  assert.equal(reloads, 0);
  assert.equal(listeners.size, 0);
});

test('a missing URL commit times out without reloading a stale address', async () => {
  const listeners = new Set();
  let reloads = 0;
  const api = vm.runInNewContext(source + '\nAddressNavigation;', { URL, URLSearchParams,
    setTimeout: callback => setTimeout(callback, 0), clearTimeout,
    chrome: { tabs: {
      async query() { return [{ id: 4, url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=first' }]; },
      onUpdated: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
      async update() {
        for (const listener of listeners) {
          listener(99, { url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=opaque-local-id' });
          listener(4, { url: 'https://www.dtek-oem.com.ua/ua/shutdowns#ua-shutdowns-address=first' });
        }
      },
      async reload() { reloads++; }
    } }
  });
  await assert.rejects(api.open(address), /підтвердити перехід/);
  assert.equal(reloads, 0);
  assert.equal(listeners.size, 0);
});
