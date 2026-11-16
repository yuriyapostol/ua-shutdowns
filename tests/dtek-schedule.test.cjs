const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../dtek-schedule.js'), 'utf8');
const api = vm.runInNewContext(source + '\nDtekSchedule;', { Intl, Date });
const plain = value => JSON.parse(JSON.stringify(value));
const slots = (overrides = {}) => Array.from({ length: 24 }, (_, hour) =>
  ({ start: hour * 60, end: (hour + 1) * 60, state: overrides[hour] || 'yes' }));

test('merges full hours and adjacent half hours into continuous outages', () => {
  const states = { 2: 'second', 13: 'first' };
  for (let hour = 3; hour < 13; hour++) states[hour] = 'no';
  assert.deepEqual(plain(api.intervals(slots(states))), [[150, 810]]);
});

test('first and second indicate the half without electricity', () => {
  assert.deepEqual(plain(api.intervals(slots({ 2: 'first', 4: 'second', 5: 'first' }))), [[120, 150], [270, 330]]);
  assert.deepEqual(plain(api.intervals(slots({ 2: 'first', 3: 'second' }))), [[120, 150], [210, 240]]);
});

test('handles midnight, all-day outages and a day without outages', () => {
  assert.deepEqual(plain(api.intervals(slots({ 0: 'first', 23: 'second' }))), [[0, 30], [1410, 1440]]);
  assert.deepEqual(plain(api.intervals(slots(Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, 'no']))))), [[0, 1440]]);
  assert.deepEqual(plain(api.intervals(slots())), []);
  assert.equal(api.format(0), '00:00');
  assert.equal(api.format(150), '02:30');
  assert.equal(api.format(1440), '24:00');
});

test('rejects missing hours, duplicates and unknown states rather than inventing availability', () => {
  assert.equal(api.intervals(slots().slice(0, 23)), null);
  const duplicate = slots();
  duplicate[23] = duplicate[22];
  assert.equal(api.intervals(duplicate), null);
  assert.equal(api.intervals(slots({ 2: 'unknown' })), null);
});

function fixture({ mobile = false, states = {}, date = '2026-11-15', secondLine } = {}) {
  const types = { yes: 'cell-non-scheduled', no: 'cell-scheduled', first: 'cell-first-half', second: 'cell-second-half' };
  const cell = state => {
    const classList = [types[state] || 'cell-unknown'];
    classList.contains = value => classList.includes(value);
    return { classList };
  };
  const label = hour => ({ classList: [], textContent: `${String(hour).padStart(2, '0')}-${String(hour + 1).padStart(2, '0')}` });
  const group = values => {
    const hours = slots(values);
    const table = subset => ({ querySelectorAll(selector) {
      if (selector === 'thead th[scope="col"]') return mobile ? [] : hours.map((_, hour) => label(hour));
      return mobile ? subset.map(({ start, state }) => ({ children: [label(start / 60), cell(state)] })) :
        [{ children: [{ classList: [] }, ...hours.map(({ state }) => cell(state))] }];
    } });
    return { querySelectorAll: () => mobile ? [table(hours.slice(0, 12)), table(hours.slice(12))] : [table(hours)] };
  };
  const day = {
    getAttribute: () => String(Date.parse(date + 'T12:00:00Z') / 1000),
    querySelectorAll: () => [group(states), ...(secondLine ? [group(secondLine)] : [])]
  };
  return { querySelectorAll: () => [day] };
}

test('reads both desktop and mobile daily tables with the same result', () => {
  const expected = { date: '2026-11-15', lines: [[[150, 270], [1410, 1440]]] };
  for (const mobile of [false, true]) {
    const root = fixture({ mobile, states: { 2: 'second', 3: 'no', 4: 'first', 23: 'second' } });
    assert.deepEqual(plain(api.read(root, '2026-11-15')), expected);
  }
});

test('keeps separate supply lines separate and can select another day in the same format', () => {
  const root = fixture({ states: { 2: 'first' }, secondLine: { 3: 'second' } });
  assert.deepEqual(plain(api.read(root, '2026-11-15')), { date: '2026-11-15', lines: [[[120, 150]], [[210, 240]]] });
  assert.equal(api.read(root, '2026-11-16'), null);
  assert.deepEqual(plain(api.read(fixture({ date: '2026-11-16' }), '2026-11-16')), { date: '2026-11-16', lines: [[]] });
});

test('uses Kyiv dates across midnight and daylight saving offsets', () => {
  assert.equal(api.dateKey(Date.parse('2026-11-14T22:30:00Z')), '2026-11-15');
  assert.equal(api.dateKey(Date.parse('2026-07-14T21:30:00Z')), '2026-07-15');
});

test('validates stored schedules, including no outages, without accepting invalid intervals', () => {
  assert.equal(api.isValid({ date: '2026-11-15', lines: [[[150, 780]]] }), true);
  assert.equal(api.isValid({ date: '2026-11-15', lines: [[]] }), true);
  for (const value of [null, { date: '2026-02-30', lines: [[]] }, { date: '2026-11-15', lines: [] },
    { date: '2026-11-15', lines: [[[30, 15]]] }, { date: '2026-11-15', lines: [[[0, 1500]]] },
    { date: '2026-11-15', lines: [[[0, 90], [60, 120]]] }]) assert.equal(api.isValid(value), false);
});

test('copies a dated Ukrainian heading and plain interval rows', () => {
  const address = { city: 'Обухів', queue: '5.2', schedule: {
    date: '2026-11-11', lines: [[[150, 780], [960, 1110]]]
  } };
  assert.equal(api.toText(address, { name: 'Київська область' }),
    'Відключення світла в середу, 11 листопада 2026 (Київська обл., Обухів, черга 5.2):\n02:30 – 13:00\n16:00 – 18:30');
});

test('uses the schedule date and calculates its actual weekday', () => {
  const address = { city: 'Обухів', queue: '5.2' };
  assert.match(api.toText(address, { name: 'Київська область' }, {
    date: '2026-11-12', lines: [[[0, 1440]]]
  }), /^Відключення світла в четвер, 12 листопада 2026/);
});

test('copying preserves separate lines and distinguishes no outages from unknown data', () => {
  const address = { city: 'Київ', queue: '1.1, 2.2', schedule: {
    date: '2026-11-15', lines: [[], [[1410, 1440]]]
  } };
  assert.equal(api.toText(address, { name: 'Київ' }),
    'Відключення світла в неділю, 15 листопада 2026 (Київ, черга 1.1, 2.2):\nЛінія 1:\nБез відключень\nЛінія 2:\n23:30 – 24:00');
  assert.throws(() => api.toText({ city: 'Обухів' }, { name: 'Київська область' }), /Графік ще не отримано/);
});

test('date navigation handles leap years, month/year boundaries and invalid dates', () => {
  assert.equal(api.shiftDate('2028-02-28', 1), '2028-02-29');
  assert.equal(api.shiftDate('2028-02-29', 1), '2028-03-01');
  assert.equal(api.shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(api.shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(api.shiftDate('2026-03-29', 1), '2026-03-30');
  assert.equal(api.shiftDate('0001-01-01', -1), null);
  assert.equal(api.shiftDate('9999-12-31', 1), null);
  assert.equal(api.shiftDate('2026-02-30', 1), null);
});

test('reads all available daily tables rather than only today', () => {
  const first = fixture({ date: '2026-11-15', states: { 2: 'first' } });
  const second = fixture({ date: '2026-11-16', states: { 4: 'second' } });
  const root = { querySelectorAll: () => [...second.querySelectorAll(), ...first.querySelectorAll()] };
  assert.deepEqual(plain(api.readAll(root)), [
    { date: '2026-11-15', lines: [[[120, 150]]] }, { date: '2026-11-16', lines: [[[270, 300]]] }
  ]);
});

test('historical copying uses that day and queue instead of the current queue', () => {
  const address = { city: 'Обухів', queue: '5.2', schedules: {
    '2026-11-11': { date: '2026-11-11', lines: [[[150, 780]]], queue: '4.2' }
  } };
  const schedule = api.forDate(address, '2026-11-11');
  assert.equal(api.toText(address, { name: 'Київська область' }, schedule),
    'Відключення світла в середу, 11 листопада 2026 (Київська обл., Обухів, черга 4.2):\n02:30 – 13:00');
  assert.equal(api.forDate(address, '2026-11-12'), null);
});
