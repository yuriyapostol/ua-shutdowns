const { fixtureState } = require('./storage-fixture.cjs');
const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../background.js'), 'utf8');
const sites = readFileSync(require.resolve('../dtek-sites.js'), 'utf8');
const schedule = readFileSync(require.resolve('../dtek-schedule.js'), 'utf8');
const settings = readFileSync(require.resolve('../address-identity.js'), 'utf8') + '\n' + readFileSync(require.resolve('../address-settings.js'), 'utf8');
const navigation = readFileSync(require.resolve('../address-navigation.js'), 'utf8');
const url = 'https://www.dtek-krem.com.ua/ua/shutdowns';
const sender = { frameId: 0, url, tab: { id: 7 } };

function setup(initial = {}, options = {}) {
  const data = structuredClone(initial);
  if (data.addresses) { data.scheduleData = fixtureState(data.addresses); delete data.addresses; }
  const sessionData = {};
  const calls = [];
  const warnings = [];
  let listener;
  const chrome = {
    storage: { local: {
      async get() { return structuredClone(data); },
      async set(value) { Object.assign(data, structuredClone(value)); }
    }, session: {
      async get() { return structuredClone(sessionData); },
      async set(value) { Object.assign(sessionData, structuredClone(value)); },
      async remove(key) { delete sessionData[key]; }
    } },
    runtime: { getURL: path => 'chrome-extension://fixture/' + path,
      onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { onRemoved: { addListener(fn) { chrome.onRemoved = fn; } },
      async get(id) { assert.equal(id, 7); return { id, windowId: 3, active: options.active !== false }; },
      async query() { return [{ id: 7, url }]; },
      async update(id, details) { calls.push({ id, ...details }); },
      async reload(id) { calls.push({ reload: id }); }
    },
    windows: { async get(id) { assert.equal(id, 3); return { focused: options.focused !== false }; } },
    action: { async openPopup(details) {
      if (options.fail) throw new Error('Popup blocked');
      calls.push(details.windowId);
    } }
  };
  function startWorker() {
    const context = vm.createContext({ chrome, URL, URLSearchParams, crypto: require('node:crypto').webcrypto,
      console: { warn: (...args) => warnings.push(args) } });
    context.importScripts = () => vm.runInContext(i18nFixtureSource() + '\n' + sites + '\n' + schedule + '\n' + settings + '\n' + navigation, context);
    vm.runInContext(source, context);
  }
  startWorker();
  return { data, sessionData, calls, warnings, options,
    removeTab: tabId => chrome.onRemoved(tabId),
    restart: startWorker,
    send(from = sender, message = { type: 'popup-detected' }) {
      return new Promise(resolve => {
        if (listener(message, from, resolve) !== true) resolve(null);
      });
    }
  };
}

test('opens the existing action popup in the detecting tab window', async () => {
  const p = setup();
  assert.equal((await p.send()).ok, true);
  assert.deepEqual(p.calls, [3]);
  assert.equal(p.data.popupOfferPending, true);
  assert.equal(p.data.popupOfferAutoOpened, true);
});

test('concurrent detections and service worker restarts do not reopen the same offer', async () => {
  const p = setup();
  await Promise.all([p.send(), p.send(), p.send()]);
  assert.deepEqual(p.calls, [3]);
  p.restart();
  await p.send();
  assert.deepEqual(p.calls, [3]);
});

test('does not open when closing is enabled or refusal is less than a month old', async () => {
  for (const initial of [{ autoClosePopups: true }, { popupOfferDismissedAt: Date.now() },
    { popupOfferPending: true, popupOfferDismissedAt: Date.now() }]) {
    const p = setup(initial);
    await p.send();
    assert.deepEqual(p.calls, []);
  }
});

test('opens a new offer after the cooldown, even if an earlier offer was opened', async () => {
  const p = setup({ popupOfferPending: false, popupOfferAutoOpened: true,
    popupOfferDismissedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
  await p.send();
  assert.deepEqual(p.calls, [3]);
});

test('waits for an active tab in a focused window', async () => {
  for (const options of [{ active: false }, { focused: false }]) {
    const p = setup({}, options);
    await p.send();
    assert.deepEqual(p.calls, []);
    assert.equal(p.data.popupOfferPending, undefined);
    options.active = options.focused = true;
    await p.send();
    assert.deepEqual(p.calls, [3]);
  }
});

test('keeps the offer pending and allows retry if Chrome rejects opening it', async () => {
  const p = setup({}, { fail: true });
  assert.equal((await p.send()).ok, false);
  assert.equal(p.data.popupOfferPending, true);
  assert.equal(p.data.popupOfferAutoOpened, false);
  assert.equal(p.warnings.length, 1);
  p.options.fail = false;
  await p.send();
  assert.deepEqual(p.calls, [3]);
});

test('ignores unsupported senders, subframes and unrelated messages', async () => {
  const p = setup();
  for (const from of [{ ...sender, frameId: 1 }, { ...sender, tab: undefined },
    { ...sender, url: 'https://www.dtek-krem.com.ua.evil.example/ua/shutdowns' },
    { ...sender, url: 'https://www.dtek-krem.com.ua/other-page' }]) {
    assert.equal(await p.send(from), null);
  }
  assert.equal(await p.send(sender, { type: 'unrelated' }), null);
  assert.deepEqual(p.calls, []);
  assert.equal(p.data.popupOfferPending, undefined);
});

const savedAddresses = [
  { id: 'first', revision: 1, region: 'krem', city: 'Обухів', street: 'Миру', house: '17' },
  { id: 'second', revision: 1, region: 'krem', city: 'Обухів', street: 'Миру', house: '23' }
];
const popupSender = { url: 'chrome-extension://fixture/popup.html' };

test('opens the saved address from the popup and serves its selection after worker restart', async () => {
  const p = setup({ addresses: savedAddresses });
  const response = await p.send(popupSender, { type: 'open-address', addressId: 'second' });
  assert.equal(response.ok, true);
  assert.deepEqual(p.calls, [{ reload: 7 }]);
  p.restart();
  const selected = await p.send(sender, { type: 'get-page-address' });
  assert.equal(selected.ok, true);
  assert.equal(selected.address.id, 'second');
  assert.equal(selected.address.house, '23');
});

test('page address requests use the sender tab rather than an ID supplied in the message', async () => {
  const p = setup({ addresses: savedAddresses });
  p.sessionData['address-for-tab:7'] = { id: 'second', revision: 1, region: 'krem' };
  const otherTab = { ...sender, tab: { id: 8 } };
  const response = await p.send(otherTab, { type: 'get-page-address', tabId: 7 });
  assert.equal(response.address.id, 'first');
  assert.equal((await p.send(sender, { type: 'get-page-address' })).address.id, 'second');
});

test('closed tab selections are removed without touching another tab', async () => {
  const p = setup();
  p.sessionData['address-for-tab:7'] = { id: 'first', revision: 1, region: 'krem' };
  p.sessionData['address-for-tab:8'] = { id: 'second', revision: 1, region: 'krem' };
  p.removeTab(7);
  await Promise.resolve();
  assert.equal(p.sessionData['address-for-tab:7'], undefined);
  assert.equal(p.sessionData['address-for-tab:8'].id, 'second');
});

test('content scripts cannot request address navigation and deleted addresses fail safely', async () => {
  const p = setup({ addresses: savedAddresses });
  assert.equal(await p.send(sender, { type: 'open-address', addressId: 'second' }), null);
  assert.equal((await p.send(popupSender, { type: 'open-address', addressId: 'deleted' })).ok, false);
  assert.deepEqual(p.calls, []);
});

test('legacy migration and a new address selection cannot overwrite each other', async () => {
  const p = setup({ addresses: savedAddresses });
  await Promise.all([
    p.send(sender, { type: 'get-page-address', legacyAddressId: 'first' }),
    p.send(popupSender, { type: 'open-address', addressId: 'second' })
  ]);
  assert.equal((await p.send(sender, { type: 'get-page-address' })).address.id, 'second');
});

test('saves the detected queue only for the selected unchanged address', async () => {
  const p = setup({ addresses: savedAddresses });
  p.sessionData['address-for-tab:7'] = { id: 'second', revision: 1, region: 'krem' };
  assert.equal((await p.send(sender, { type: 'save-address-queue', address: savedAddresses[0], queue: '1.1' })).ok, false);
  const schedule = { date: '2026-11-15', lines: [[[150, 780]]] };
  assert.equal((await p.send(sender, { type: 'save-address-queue', address: savedAddresses[1], queue: '4.2', schedule })).ok, true);
  const updated = (await p.send(sender, { type: 'get-page-address' })).address;
  assert.equal(updated.queue, '4.2');
  assert.deepEqual(JSON.parse(JSON.stringify(updated.schedules[schedule.date])), { ...schedule, queue: '4.2' });
  assert.equal(p.data.scheduleData.addresses[1].schedules, undefined);
  assert.equal(p.data.scheduleData.addresses[0].queue, '');
});

test('background errors use the saved interface language even after a worker restart', async () => {
  const p = setup({ interfaceLanguage: 'en' });
  const popupSender = { url: 'chrome-extension://fixture/popup.html' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await p.send(popupSender, { type: 'open-address', addressId: 'missing' });
    assert.equal(result.ok, false);
    assert.match(result.error, /already been deleted/);
    p.restart();
  }
});
