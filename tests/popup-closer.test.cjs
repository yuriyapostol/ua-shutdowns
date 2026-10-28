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

async function page({ enabled = false, modals = [], loading, loadError = false } = {}) {
  const observers = [];
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  let listener;
  let onHide;
  const warnings = [];
  vm.runInNewContext(source, {
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document: { documentElement: {}, querySelectorAll: () => modals },
    window: { addEventListener: (_type, fn) => { onHide = fn; } },
    MutationObserver: class {
      constructor(fn) { this.callback = fn; this.active = false; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
    chrome: { storage: { onChanged: {
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
    modals, warnings,
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
});

test('closes existing, delayed and reopened popups through their dismiss controls', async () => {
  const item = modal();
  const p = await page({ enabled: true, modals: [item] });
  assert.equal(item.open, false);
  const delayed = modal();
  p.modals.push(delayed);
  p.notify();
  assert.equal(delayed.open, false);
  item.open = true;
  p.notify();
  assert.equal(item.clicks, 2);
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
