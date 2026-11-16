const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../dtek-popup-closer.js'), 'utf8');

function modal({ open = true, button = true, overlay = true, completes = true } = {}) {
  const item = {
    open, clicks: 0, completes,
    classList: { contains: () => item.open },
    getAttribute: () => String(!item.open),
    querySelector(selector) {
      if (!(selector.startsWith('.modal__close') ? button : overlay)) return null;
      return { click() { item.clicks++; if (item.completes) item.open = false; } };
    }
  };
  return item;
}

async function page({ enabled = false, modals = [], loading, loadError = false, visible = true } = {}) {
  const observers = [];
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  let listener;
  let onHide;
  let onVisibility;
  const warnings = [];
  let detections = 0;
  let scans = 0;
  const document = { documentElement: {}, visibilityState: visible ? 'visible' : 'hidden',
    querySelectorAll() { scans++; return modals; },
    addEventListener: (_type, fn) => { onVisibility = fn; } };
  vm.runInNewContext(source, {
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document,
    window: { addEventListener: (_type, fn) => { onHide = fn; } },
    MutationObserver: class {
      constructor(fn) { this.callback = fn; this.active = false; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
    chrome: { runtime: { async sendMessage(message) {
      assert.equal(message.type, 'popup-detected');
      detections++;
      return { ok: true };
    } }, storage: { onChanged: {
      addListener(fn) { listener = fn; }, removeListener() { listener = null; }
    } } },
    AddressSettings: { async loadPreferences() {
      if (loading) return loading;
      if (loadError) throw new Error('Storage unavailable');
      return { autoClosePopups: enabled };
    } },
    console: { warn: (...args) => warnings.push(args) }
  });
  const p = {
    modals, warnings, get detections() { return detections; },
    get scans() { return scans; },
    get observing() { return observers.some(observer => observer.active); },
    tick(ms) {
      const deadline = now + ms;
      while (timers.size) {
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (timer.at > deadline) break;
        now = timer.at;
        timers.delete(id);
        timer.callback();
      }
      now = deadline;
    },
    notify() { for (const observer of observers) if (observer.active) observer.callback(); },
    change(value, area = 'local') { listener?.({ autoClosePopups: { newValue: value } }, area); },
    hide(persisted = false) { onHide({ persisted }); },
    visible(value = true) { document.visibilityState = value ? 'visible' : 'hidden'; onVisibility(); },
    async ready() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
  };
  await p.ready();
  return p;
}

test('does nothing when the preference is off', async () => {
  const item = modal();
  const p = await page({ modals: [item] });
  p.notify();
  assert.equal(item.clicks, 0);
  assert.equal(p.detections, 1);
});

test('detects delayed and reopened windows once per opening when closing is disabled', async () => {
  const item = modal({ open: false });
  const p = await page({ modals: [item] });
  assert.equal(p.detections, 0);
  item.open = true;
  p.notify();
  p.notify();
  assert.equal(p.detections, 1);
  item.open = false;
  p.notify();
  item.open = true;
  p.notify();
  assert.equal(p.detections, 2);
  assert.equal(item.clicks, 0);
});

test('closes existing, delayed and reopened popups through their dismiss controls', async () => {
  const item = modal();
  const p = await page({ enabled: true, modals: [item] });
  assert.equal(item.open, false);
  assert.equal(p.detections, 0);
  const delayed = modal();
  p.modals.push(delayed);
  p.notify();
  assert.equal(delayed.open, false);
  item.open = true;
  p.notify();
  assert.equal(item.clicks, 2);
});

test('reports a still-open modal again when its tab becomes visible', async () => {
  const item = modal();
  const p = await page({ modals: [item] });
  assert.equal(p.detections, 1);
  p.visible();
  assert.equal(p.detections, 2);
  p.hide();
  p.visible();
  assert.equal(p.detections, 2);
});

test('does not scan or observe a background tab and scans immediately on activation', async () => {
  for (const enabled of [false, true]) {
    const item = modal();
    const p = await page({ enabled, modals: [item], visible: false });
    p.notify();
    p.tick(1000);
    assert.equal(p.observing, false);
    assert.equal(p.scans, 0);
    assert.equal(p.detections, 0);
    assert.equal(item.clicks, 0);
    p.visible();
    assert.equal(p.observing, true);
    assert.equal(p.scans, 1);
    assert.equal(p.detections, enabled ? 0 : 1);
    assert.equal(item.clicks, enabled ? 1 : 0);
  }
});

test('switching away disconnects observation and cancels pending close retries', async () => {
  const item = modal({ completes: false });
  const p = await page({ enabled: true, modals: [item] });
  assert.equal(item.clicks, 1);
  p.visible(false);
  const scans = p.scans;
  item.completes = true;
  p.notify();
  p.tick(1000);
  assert.equal(p.observing, false);
  assert.equal(p.scans, scans);
  assert.equal(item.clicks, 1);
  p.visible();
  assert.equal(item.clicks, 2);
  assert.equal(item.open, false);
});

test('preference changes in a hidden tab apply only when it becomes visible', async () => {
  const item = modal();
  const p = await page({ modals: [item], visible: false });
  p.change(true);
  assert.equal(p.scans, 0);
  assert.equal(p.observing, false);
  p.visible();
  assert.equal(item.open, false);
  assert.equal(p.detections, 0);
});

test('preference changes take effect on the current page in both directions', async () => {
  const item = modal();
  const p = await page({ modals: [item] });
  p.change(true, 'sync');
  assert.equal(item.open, true);
  p.change(true);
  assert.equal(item.open, false);
  p.change(false);
  item.open = true;
  p.notify();
  assert.equal(item.open, true);
});

test('uses the dismiss overlay if no close button exists and skips closed windows', async () => {
  const item = modal({ button: false });
  const closed = modal({ open: false });
  const noDismiss = modal({ button: false, overlay: false });
  await page({ enabled: true, modals: [item, closed, noDismiss] });
  assert.equal(item.clicks, 1);
  assert.equal(closed.clicks, 0);
  assert.equal(noDismiss.clicks, 0);
});

test('does not loop when a dismiss handler has not finished closing the window', async () => {
  const item = modal({ completes: false });
  const p = await page({ enabled: true, modals: [item] });
  p.notify();
  p.notify();
  assert.equal(item.clicks, 1);
  item.open = false;
  p.notify();
  item.open = true;
  p.notify();
  assert.equal(item.clicks, 2);
});

test('retries when the page installs its close handler after the first attempt', async () => {
  const item = modal({ completes: false });
  const p = await page({ enabled: true, modals: [item] });
  assert.equal(item.clicks, 1);
  item.completes = true;
  // Installing a JS listener causes no DOM mutation to wake an observer.
  p.tick(300);
  assert.equal(item.clicks, 2);
  assert.equal(item.open, false);
  p.tick(1500);
  assert.equal(item.clicks, 2);
});

test('disabling the preference cancels pending retries', async () => {
  const item = modal({ completes: false });
  const p = await page({ enabled: true, modals: [item] });
  p.change(false);
  item.completes = true;
  p.tick(1000);
  assert.equal(item.open, true);
  assert.equal(item.clicks, 1);
});

test('a storage change takes precedence over an older pending settings read', async () => {
  let resolve;
  const loading = new Promise(done => { resolve = done; });
  const item = modal();
  const p = await page({ modals: [item], loading });
  p.change(true);
  resolve({ autoClosePopups: false });
  await p.ready();
  item.open = true;
  p.notify();
  assert.equal(item.open, false);
});

test('preserves the observer across back/forward caching but stops on final unload', async () => {
  const item = modal();
  const p = await page({ enabled: true, modals: [item] });
  p.hide(true);
  item.open = true;
  p.notify();
  assert.equal(item.open, false);
  p.hide(false);
  item.open = true;
  p.notify();
  assert.equal(item.open, true);
});

test('a settings read failure leaves popups alone', async () => {
  const item = modal();
  const p = await page({ loadError: true, modals: [item] });
  assert.equal(item.clicks, 0);
  assert.equal(p.warnings.length, 1);
});
