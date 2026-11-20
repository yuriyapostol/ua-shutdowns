const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function popup({ url = 'https://www.dtek-krem.com.ua/ua/shutdowns', unavailable = false } = {}) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.dataset = {}; this.hidden = false; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener() {}
    focus() {}
  }
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement: () => new Element(),
    querySelectorAll: () => []
  };
  const date = '2026-11-19';
  const key = JSON.stringify(['krem', 'обухів', 'миру', '17']);
  const data = { addresses: [{ id: 'fixture', region: 'krem', city: 'Обухів', street: 'Миру', house: '17' }],
    addressArchives: { [key]: { queue: '5.2', schedules: {
      [date]: { date, lines: [[[60, 120]]], queue: '5.2' }
    } } } };
  const calls = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const chrome = {
    storage: {
      local: { async get() { calls.push('read'); return structuredClone(data); },
        async set(value) { Object.assign(data, structuredClone(value)); } },
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
  vm.runInNewContext(source, { chrome, document, URL, Intl, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return Date.UTC(2026, 10, 19, 12); } } });
  const drain = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
  await drain();
  return { calls, release, drain, elements };
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
