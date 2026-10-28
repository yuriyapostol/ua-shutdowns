const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../dtek-content-script.js'), 'utf8');
const sitesSource = readFileSync(require.resolve('../dtek-sites.js'), 'utf8');
const settingsSource = readFileSync(require.resolve('../address-settings.js'), 'utf8');

// A deterministic model of DTEK's substring autocomplete and dependent fields.
function page({ cities = ['м. Обухів'], streets = ['вул. Миру'],
  houses = ['17А'], delay = 0, readyAt = 0, limit = Infinity, storageDelay = 0, storageError = false,
  hostname = 'www.dtek-krem.com.ua', fragment = '', savedAddresses,
  address = { city: 'Обухів', street: 'Миру', house: '17 А' } } = {}) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const lists = new Map();
  const clicks = [];
  const searches = [];
  const warnings = [];
  const ids = ['city', 'street', 'house_num'];
  const isKyiv = /^(www\.)?dtek-kem\.com\.ua$/.test(hostname);
  const choices = [cities, streets, houses];
  const schedule = (callback, ms) => {
    timers.set(++timerId, { at: now + ms, callback });
    return timerId;
  };
  const inputs = ids.map((id, index) => ({
    id, value: '', disabled: index > (isKyiv ? 1 : 0),
    classList: { contains: () => !inputs[index].disabled },
    oninput() {},
    dispatchEvent(event) {
      if (event.type !== 'input') return;
      searches.push([id, this.value]);
      lists.clear();
      const query = this.value.toLocaleLowerCase('uk');
      if (!query || (index < 2 && query.length < 3)) return;
      lists.set(id + 'autocomplete-list', {
        children: choices[index].filter(value => value.toLocaleLowerCase('uk').includes(query)).slice(0, limit)
          .map(value => ({
            tagName: 'DIV', textContent: value.toLocaleLowerCase('uk'),
            querySelector: () => ({ value }),
            dispatchEvent() {
              inputs[index].value = value;
              clicks.push([id, value]);
              lists.clear();
              if (index < 2) schedule(() => { inputs[index + 1].disabled = false; }, delay);
            }
          }))
      });
    }
  }));
  const document = {
    getElementById(id) {
      if (now < readyAt) return null;
      if (isKyiv && id === 'city') return null;
      return inputs.find(input => input.id === id) || lists.get(id);
    },
    addEventListener(type, callback, { signal }) {
      listeners.set(type, callback);
      signal.addEventListener('abort', () => listeners.delete(type), { once: true });
    }
  };
  vm.runInNewContext(sitesSource + '\n' + settingsSource + '\n' + source, {
    chrome: { storage: { local: { async get() {
      if (storageDelay) await new Promise(resolve => schedule(resolve, storageDelay));
      if (storageError) throw new Error('Storage unavailable');
      const region = isKyiv && !['Київ', 'м. Київ'].includes(address?.city) ? 'krem' : hostname.match(/dtek-([^.]+)/)[1];
      return { addresses: savedAddresses || (address ? [{ id: 'fixture-address', region, ...address }] : []) };
    } } } },
    document, AbortController, Event, KeyboardEvent: Event, MouseEvent: Event,
    location: { hostname, href: `https://${hostname}/ua/shutdowns${fragment}` }, URL, URLSearchParams,
    setTimeout: schedule, clearTimeout: id => timers.delete(id),
    Date: class extends Date { static now() { return now; } },
    console: { warn: (...args) => warnings.push(args) }
  });
  return {
    inputs, clicks, searches, warnings, listeners,
    schedule,
    interact(index, value, isTrusted = true, type = 'input') {
      inputs[index].value = value;
      listeners.get(type)?.({ isTrusted, target: { closest: () => inputs[index] } });
    },
    async finish() {
      for (let step = 0; step < 2000; step++) {
        // Drain the promise chain between browser timer tasks.
        for (let index = 0; index < 30; index++) await Promise.resolve();
        if (!timers.size) return;
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      throw new Error('Automation did not terminate');
    }
  };
}

test('selects canonical labels and the correct building despite formatting changes', async () => {
  const p = page({ cities: ['Обухівська ТГ', 'м. Обухів'],
    streets: ['вул. Мирного Панаса', 'вул. Миру'],
    houses: ['1А', '117А', '17/1', '17', '17A'] });
  await p.finish();
  assert.deepEqual(p.clicks, [['city', 'м. Обухів'], ['street', 'вул. Миру'], ['house_num', '17A']]);
  assert.equal(p.listeners.size, 0);
  assert.equal(p.warnings.length, 0);
});

test('does not search or change fields when no address has been saved', async () => {
  const p = page({ address: null });
  await p.finish();
  assert.deepEqual(p.searches, []);
  assert.deepEqual(p.clicks, []);
  assert.deepEqual(p.inputs.map(input => input.value), ['', '', '']);
  assert.equal(p.warnings.length, 0);
  assert.equal(p.listeners.size, 0);
});

for (const hostname of ['www.dtek-krem.com.ua', 'www.dtek-dnem.com.ua', 'www.dtek-oem.com.ua', 'www.dtek-dem.com.ua']) {
  test(`selects city, street and house on ${hostname}`, async () => {
    const p = page({ hostname });
    await p.finish();
    assert.deepEqual(p.clicks.map(([id]) => id), ['city', 'street', 'house_num']);
  });
}

for (const hostname of ['www.dtek-kem.com.ua', 'dtek-kem.com.ua']) {
  test(`selects street and house without a city input on ${hostname}`, async () => {
    const p = page({ hostname, address: { city: 'м. Київ', street: 'Миру', house: '17 А' } });
    await p.finish();
    assert.deepEqual(p.clicks, [['street', 'вул. Миру'], ['house_num', '17А']]);
    assert.equal(p.warnings.length, 0);
  });
}

test('does not substitute another settlement with similarly named streets in Kyiv', async () => {
  const p = page({ hostname: 'www.dtek-kem.com.ua' });
  await p.finish();
  assert.deepEqual(p.searches, []);
  assert.deepEqual(p.clicks, []);
  assert.equal(p.listeners.size, 0);
});

test('uses whole words and commits original labels only by clicking', async () => {
  const p = page({ cities: ['Обухівська ТГ', 'М. Обухів'],
    streets: ['Вул. Мирного Панаса', 'Вул. Миру'],
    houses: ['17', '17 Б', '17 А', '117 А'] });
  await p.finish();
  assert.deepEqual(p.searches, [['city', 'Обухів'], ['street', 'Миру'], ['house_num', '17']]);
  assert.deepEqual(p.clicks, [['city', 'М. Обухів'], ['street', 'Вул. Миру'], ['house_num', '17 А']]);
  assert.deepEqual(p.inputs.map(input => input.value), ['М. Обухів', 'Вул. Миру', '17 А']);
});

test('compares available fuzzy matches instead of clicking the first substring', async () => {
  const p = page({ streets: ['вул. Героїв Майдану', 'вул. Героїв Українки'],
    address: { city: 'Обухів', street: 'Героїв України', house: '17 А' } });
  await p.finish();
  assert.deepEqual(p.clicks, [['city', 'м. Обухів'], ['street', 'вул. Героїв Українки'], ['house_num', '17А']]);
  assert.deepEqual(p.searches.filter(([id]) => id === 'street'),
    [['street', 'Героїв'], ['street', 'Героїв України'], ['street', 'Героїв']]);
});

test('adds words for cities, streets and houses when the desired option is not yet shown', async () => {
  const p = page({ cities: ['с. Велика Димерка', 'с. Велика Олександрівка'],
    streets: ['вул. Героїв Майдану', 'вул. Героїв Небесної Сотні'],
    houses: ['17', '17 А'], limit: 1,
    address: { city: 'Велика Олександрівка', street: 'Героїв Небесної Сотні', house: '17 А' } });
  await p.finish();
  assert.deepEqual(p.searches, [
    ['city', 'Велика'], ['city', 'Велика Олександрівка'],
    ['street', 'Героїв'], ['street', 'Героїв Небесної'],
    ['house_num', '17'], ['house_num', '17 А']
  ]);
  assert.deepEqual(p.inputs.map(input => input.value),
    ['с. Велика Олександрівка', 'вул. Героїв Небесної Сотні', '17 А']);
});

test('adds the third word if two words still do not reveal the desired option', async () => {
  const p = page({ streets: ['вул. Героїв Небесної Варти', 'вул. Героїв Небесної Сотні'], limit: 1,
    address: { city: 'Обухів', street: 'Героїв Небесної Сотні', house: '17 А' } });
  await p.finish();
  assert.deepEqual(p.searches.filter(([id]) => id === 'street'),
    [['street', 'Героїв'], ['street', 'Героїв Небесної'], ['street', 'Героїв Небесної Сотні']]);
  assert.equal(p.inputs[1].value, 'вул. Героїв Небесної Сотні');
});

test('skips geographical types when forming queries and preserves whole hyphenated names', async () => {
  const p = page({ cities: ['м. Кам’янець-Подільський'], streets: ['вул. Лесі Українки'],
    address: { city: 'М. Кам’янець-Подільський', street: 'вул. Лесі Українки', house: '17 А' } });
  await p.finish();
  assert.deepEqual(p.searches, [['city', 'Кам’янець-Подільський'], ['street', 'Лесі'], ['house_num', '17']]);
  assert.equal(p.clicks.length, 3);
});

test('waits for the form and for dependent fields to become ready', async () => {
  const p = page({ readyAt: 300, delay: 700 });
  await p.finish();
  assert.equal(p.clicks.length, 3);
});

test('a missing city stops the sequence and restores the original field value', async () => {
  const p = page({ cities: ['м. Київ'] });
  await p.finish();
  assert.deepEqual(p.clicks, []);
  assert.equal(p.inputs[0].value, '');
  assert.equal(p.listeners.size, 0);
});

test('does not substitute a different building number', async () => {
  const p = page({ houses: ['1А', '117А', '18А'] });
  await p.finish();
  assert.equal(p.clicks.length, 2);
  assert.equal(p.inputs[2].value, '');
});

test('trusted manual interaction cancels pending selection without overwriting it', async () => {
  const p = page({ delay: 700 });
  p.schedule(() => p.interact(0, 'м. Київ', true, 'pointerdown'), 100);
  await p.finish();
  assert.deepEqual(p.clicks, [['city', 'м. Обухів']]);
  assert.equal(p.inputs[0].value, 'м. Київ');
  assert.equal(p.listeners.size, 0);
});

test('synthetic events do not cancel automation', async () => {
  const p = page({ readyAt: 300 });
  p.interact(0, '', false);
  await p.finish();
  assert.equal(p.clicks.length, 3);
});

test('manual interaction while settings load prevents subsequent automatic selection', async () => {
  const p = page({ storageDelay: 700 });
  p.interact(0, 'м. Київ');
  await p.finish();
  assert.deepEqual(p.clicks, []);
  assert.equal(p.inputs[0].value, 'м. Київ');
  assert.equal(p.listeners.size, 0);
});

test('storage failures stop selection without substituting the default address', async () => {
  const p = page({ storageError: true });
  await p.finish();
  assert.deepEqual(p.clicks, []);
  assert.equal(p.warnings.length, 1);
  assert.equal(p.listeners.size, 0);
});

test('manual changes after completion persist', async () => {
  const p = page();
  await p.finish();
  p.interact(0, 'м. Київ');
  await p.finish();
  assert.equal(p.inputs[0].value, 'м. Київ');
  assert.equal(p.clicks.length, 3);
});

test('a field that never becomes ready times out and releases listeners', async () => {
  const p = page({ readyAt: Infinity });
  await p.finish();
  assert.deepEqual(p.clicks, []);
  assert.equal(p.listeners.size, 0);
});


test('a tab-specific address ID selects the intended house among multiple saved addresses', async () => {
  const p = page({ houses: ['17 А', '23'], fragment: '#ua-shutdowns-address=second', savedAddresses: [
    { id: 'first', region: 'krem', city: 'Обухів', street: 'Миру', house: '17 А' },
    { id: 'second', region: 'krem', city: 'Обухів', street: 'Миру', house: '23' }
  ] });
  await p.finish();
  assert.equal(p.inputs[2].value, '23');
});

test('a deleted tab-specific ID does not fall back to a different house', async () => {
  const p = page({ fragment: '#ua-shutdowns-address=deleted' });
  await p.finish();
  assert.deepEqual(p.clicks, []);
});
