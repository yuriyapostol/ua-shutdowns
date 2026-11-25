const { fixtureState } = require('./storage-fixture.cjs');
const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function popup({ url = 'https://www.dtek-krem.com.ua/ua/shutdowns', unavailable = false, uiLocale = 'uk', interfaceLanguage, failLanguageSave = false, house = '17' } = {}) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.dataset = {}; this.hidden = false; this.events = new Map(); this.attributes = new Map(); this.style = {}; this.scrollHeight = 200; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    getBoundingClientRect() { return { top: 100, bottom: 124, left: 100, right: 300, width: 200, height: 200 }; }
    addEventListener(type, fn) { this.events.set(type, fn); }
    dispatch(type) { return this.events.get(type)?.({ target: this, currentTarget: this, preventDefault() {} }); }
    focus() {}
  }
  const elements = new Map();
  const document = {
    documentElement: { clientWidth: 420, clientHeight: 600 },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    addEventListener() {},
    createElement: () => new Element(),
    querySelectorAll: () => []
  };
  const date = '2026-11-19';
  const data = { interfaceLanguage, scheduleData: fixtureState([{ id: 'fixture', region: 'krem', city: 'Обухів', street: 'Миру', house, queue: '5.2', schedules: { [date]: { date, lines: [[[60, 120]]], queue: '5.2' } } }]) };
  const calls = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const chrome = {
    storage: {
      local: { async get(key) { if (key !== 'interfaceLanguage') calls.push('read'); return structuredClone(data); },
        async set(value) {
          if (failLanguageSave && 'interfaceLanguage' in value) throw new Error('Storage unavailable');
          Object.assign(data, structuredClone(value));
        } },
      onChanged: { addListener() {} }
    },
    tabs: {
      async query() { return [{ id: 7, url }]; },
      async sendMessage(id, message, options) {
        calls.push('refresh');
        assert.equal(id, 7);
        assert.equal(message.type, 'refresh-address-schedule');
        assert.equal(options.frameId, 0);
        if (unavailable) throw new Error('Receiving end does not exist');
        await pending;
        Object.values(data.scheduleData.archives)[0].days[date][0].lines = [[[180, 810]]];
        return { ok: true };
      }
    }
  };
  const source = ['dtek-sites.js', 'dtek-schedule.js', 'address-identity.js', 'address-settings.js', 'popup.js']
    .map(file => readFileSync(require.resolve('../' + file), 'utf8')).join('\n');
  vm.runInNewContext(i18nFixtureSource(uiLocale) + '\n' + source, { chrome, document, URL, Intl, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    Date: class extends Date { static now() { return Date.UTC(2026, 10, 19, 12); } } });
  const drain = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
  await drain();
  return { calls, release, drain, elements, data, document, chrome };
}

function renderedText(p) {
  const visit = element => [element.textContent || '', ...element.children.map(visit)].join(' ');
  return visit(p.elements.get('address-list'));
}

test('opening the popup waits for the visible table to be saved before displaying intervals', async () => {
  const p = await popup();
  assert.deepEqual(p.calls, ['refresh']);
  p.release();
  await p.drain();
  assert.match(renderedText(p), /03:00 – 13:30/);
  assert.doesNotMatch(renderedText(p), /01:00 – 02:00/);
});

test('the archive remains available when the active tab has no content script', async () => {
  const p = await popup({ unavailable: true });
  assert.match(renderedText(p), /01:00 – 02:00/);
});

test('opening on another page shows the archive without requesting a refresh', async () => {
  for (const url of ['https://example.com/', 'https://www.dtek-krem.com.ua/other-page']) {
    const p = await popup({ url });
    assert.equal(p.calls.includes('refresh'), false);
    assert.match(renderedText(p), /01:00 – 02:00/);
  }
});

test('settings language applies immediately, keeps settings open and is restored on reopening', async () => {
  const p = await popup({ url: 'https://example.com/' });
  const select = p.elements.get('interface-language');
  assert.deepEqual(select.children.map(option => [option.value, option.textContent]),
    [['en', 'English'], ['uk', 'Українська']]);
  assert.equal(select.value, 'system');
  select.value = 'en';
  await select.dispatch('change');
  assert.equal(p.data.interfaceLanguage, 'en');
  assert.equal(p.document.documentElement.lang, 'en');
  assert.equal(p.elements.get('settings-view').hidden, false);
  assert.equal(p.elements.get('screen-title').textContent, 'Settings');
  assert.equal(p.elements.get('schedule-date').placeholder, 'MM/DD/YYYY');
  assert.equal(p.elements.get('calendar-month').children[0].textContent, 'January');
  const reopened = await popup({ url: 'https://example.com/', interfaceLanguage: p.data.interfaceLanguage });
  assert.equal(reopened.elements.get('interface-language').value, 'en');
  assert.equal(reopened.document.documentElement.lang, 'en');
  select.value = 'system';
  await select.dispatch('change');
  assert.equal(p.document.documentElement.lang, 'uk');
  assert.equal(p.elements.get('schedule-date').placeholder, 'ДД.ММ.РРРР');
  assert.equal(p.elements.get('calendar-month').children[0].textContent, 'січень');
});

test('language save failure restores selector and leaves the displayed language intact', async () => {
  const p = await popup({ url: 'https://example.com/', failLanguageSave: true });
  const select = p.elements.get('interface-language');
  select.value = 'en';
  await select.dispatch('change');
  assert.equal(select.value, 'system');
  assert.equal(p.document.documentElement.lang, 'uk');
  assert.equal(p.elements.get('status').dataset.error, 'true');
});


test('calendar renders all days, switches months and selects leap day in both interface languages', async () => {
  for (const [language, label] of [['uk', 'листопад'], ['en', 'November']]) {
    const p = await popup({ url: 'https://example.com/', interfaceLanguage: language });
    const el = id => p.elements.get(id);
    const days = () => el('calendar-grid').children.flatMap(row => row.children).flatMap(cell => cell.children).filter(child => child.dataset.date);
    await el('date-other').dispatch('click');
    assert.equal(el('date-calendar').hidden, false);
    assert.match(el('calendar-grid').getAttribute('aria-label'), new RegExp(label));
    assert.equal(days().length, 30);
    assert.equal(days()[0].dataset.date, '2026-11-01');
    assert.equal(days().at(-1).dataset.date, '2026-11-30');
    await el('calendar-next').dispatch('click');
    assert.equal(days().length, 31);
    assert.equal(days()[0].dataset.date, '2026-12-01');
    el('calendar-year').value = '2024';
    el('calendar-month').value = '2';
    await el('calendar-month').dispatch('change');
    assert.equal(days().length, 29);
    await days().at(-1).dispatch('click');
    assert.equal(el('date-calendar').hidden, true);
    assert.equal(el('schedule-date').value, language === 'uk' ? '29.02.2024' : '02/29/2024');
    const select = el('interface-language');
    select.value = language === 'uk' ? 'en' : 'uk';
    await select.dispatch('change');
    await el('nav-back').dispatch('click');
    await el('date-other').dispatch('click');
    assert.equal(days().length, 29);
    assert.match(el('calendar-grid').getAttribute('aria-label'), language === 'uk' ? /February/ : /лютий/);
  }
});


function editFixture(p) {
  const visit = element => [element, ...element.children.flatMap(visit)];
  const edit = visit(p.elements.get('address-list')).find(element => element.className === 'edit-address');
  return edit.dispatch('click');
}

test('formatting edits save directly; type changes ask, allow cancellation and preserve the draft', async () => {
  for (const language of ['uk', 'en']) {
    const p = await popup({ url: 'https://example.com/', interfaceLanguage: language });
    const el = id => p.elements.get(id);
    editFixture(p);
    el('city').value = 'м. Обухів'; el('street').value = 'вул.Миру';
    await el('address-form').dispatch('submit'); await p.drain();
    assert.equal(el('home-view').hidden, false);
    assert.equal(p.data.scheduleData.addresses[0].id, 'fixture');
    editFixture(p);
    el('street').value = 'пров. Миру';
    const before = JSON.stringify(p.data);
    await el('address-form').dispatch('submit');
    assert.equal(el('identity-confirm-view').hidden, false);
    assert.match(el('identity-before').textContent, /вул.Миру/);
    assert.match(el('identity-after').textContent, /пров. Миру/);
    assert.equal(JSON.stringify(p.data), before);
    await el('nav-back').dispatch('click');
    assert.equal(el('form-view').hidden, false); assert.equal(el('street').value, 'пров. Миру');
    await el('confirm-address-replacement').dispatch('click'); await p.drain();
    assert.equal(JSON.stringify(p.data), before, 'Hidden confirmation cannot save a cancelled draft');
    await el('address-form').dispatch('submit');
    await el('confirm-address-correction').dispatch('click'); await p.drain();
    assert.equal(el('home-view').hidden, false);
    assert.equal(p.data.scheduleData.addresses[0].id, 'fixture');
    assert.ok(p.data.scheduleData.histories.fixture['2026-11-19']);
  }
});

test('a changed building letter requires a decision; different place gets a new ID and retains archives', async () => {
  const p = await popup({ url: 'https://example.com/' }); const el = id => p.elements.get(id);
  editFixture(p); el('house').value = '17А';
  await el('address-form').dispatch('submit');
  assert.equal(el('identity-confirm-view').hidden, false);
  assert.equal(p.data.scheduleData.addresses[0].house, '17');
  await el('confirm-address-replacement').dispatch('click');
  await el('confirm-address-replacement').dispatch('click'); await p.drain();
  assert.equal(el('home-view').hidden, false);
  assert.notEqual(p.data.scheduleData.addresses[0].id, 'fixture');
  assert.equal(p.data.scheduleData.addresses[0].house, '17А');
  assert.equal(p.data.scheduleData.histories.fixture, undefined);
  assert.equal(Object.keys(p.data.scheduleData.archives).length, 1);
});

test('save failures retain the confirmation for retry and stale confirmations never overwrite changes', async () => {
  const p = await popup({ url: 'https://example.com/' }); const el = id => p.elements.get(id);
  editFixture(p); el('house').value = '18';
  await el('address-form').dispatch('submit');
  const before = JSON.stringify(p.data);
  const write = p.chrome.storage.local.set;
  p.chrome.storage.local.set = async () => { throw Error('Storage unavailable'); };
  await el('confirm-address-correction').dispatch('click'); await p.drain();
  assert.equal(el('identity-confirm-view').hidden, false);
  assert.equal(el('status').dataset.error, 'true');
  assert.equal(JSON.stringify(p.data), before);
  p.chrome.storage.local.set = write;
  p.data.scheduleData.addresses[0].revision++;
  p.data.scheduleData.addresses[0].house = '19';
  const updated = JSON.stringify(p.data);
  await el('confirm-address-correction').dispatch('click'); await p.drain();
  assert.equal(el('identity-confirm-view').hidden, false);
  assert.equal(JSON.stringify(p.data), updated);
});

test('a building case edit retains the graph without showing the unverified-group warning', async () => {
  const p = await popup({ url: 'https://example.com/', house: '17 А' }); const el = id => p.elements.get(id);
  editFixture(p); el('house').value = '17 а';
  await el('address-form').dispatch('submit'); await p.drain();
  assert.equal(el('home-view').hidden, false);
  assert.equal(p.data.scheduleData.addresses[0].house, '17 а');
  assert.equal(p.data.scheduleData.addresses[0].queueVerified, true);
  assert.equal(p.data.scheduleData.addresses[0].queue, '5.2');
  assert.match(renderedText(p), /01:00 – 02:00/);
  assert.doesNotMatch(renderedText(p), /ще не підтверджена/);
});

test('archive details show intervals and supply lines without generating full sharing text', async () => {
  for (const language of ['uk', 'en']) {
    const p = await popup({ url: 'https://example.com/', interfaceLanguage: language }); const el = id => p.elements.get(id);
    const archive = Object.values(p.data.scheduleData.archives)[0];
    archive.days['2026-11-19'][0].lines = [[], [[60, 120], [180, 240]]];
    await el('open-settings').dispatch('click');
    await el('open-archives').dispatch('click'); await p.drain();
    const button = el('archive-list').children[0];
    assert.equal(button.children[1].src, 'images/keyboard-arrow-right.svg');
    assert.equal(button.children[1].getAttribute('aria-hidden'), 'true');
    await button.dispatch('click');
    assert.equal(el('archive-detail-view').hidden, false);
    const visit = node => [node.textContent || '', ...node.children.map(visit)].join(' ');
    const text = visit(el('archive-days'));
    assert.match(text, /01:00 – 02:00/); assert.match(text, /03:00 – 04:00/);
    assert.match(text, language === 'uk' ? /Лінія 1/ : /Line 1/);
    assert.match(text, language === 'uk' ? /Без відключень/ : /No outages/);
    assert.doesNotMatch(text, /Відключення світла|Power outages|Обухів|group 5.2|черга 5.2/);
    assert.match(el('archive-summary').textContent, /Обухів/);
  }
});
