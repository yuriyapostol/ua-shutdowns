const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function popup({ url = 'https://www.dtek-krem.com.ua/ua/shutdowns', unavailable = false, uiLocale = 'uk', interfaceLanguage, failLanguageSave = false } = {}) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.dataset = {}; this.hidden = false; this.events = new Map(); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener(type, fn) { this.events.set(type, fn); }
    dispatch(type) { return this.events.get(type)?.({ target: this }); }
    focus() {}
  }
  const elements = new Map();
  const document = {
    documentElement: {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    addEventListener() {},
    createElement: () => new Element(),
    querySelectorAll: () => []
  };
  const date = '2026-11-19';
  const key = JSON.stringify(['krem', 'обухів', 'миру', '17']);
  const data = { interfaceLanguage, addresses: [{ id: 'fixture', region: 'krem', city: 'Обухів', street: 'Миру', house: '17' }],
    addressArchives: { [key]: { queue: '5.2', schedules: {
      [date]: { date, lines: [[[60, 120]]], queue: '5.2' }
    } } } };
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
        data.addressArchives[key].schedules[date].lines = [[[180, 810]]];
        return { ok: true };
      }
    }
  };
  const source = ['dtek-sites.js', 'dtek-schedule.js', 'address-settings.js', 'popup.js']
    .map(file => readFileSync(require.resolve('../' + file), 'utf8')).join('\n');
  vm.runInNewContext(i18nFixtureSource(uiLocale) + '\n' + source, { chrome, document, URL, Intl, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return Date.UTC(2026, 10, 19, 12); } } });
  const drain = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
  await drain();
  return { calls, release, drain, elements, data, document };
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
