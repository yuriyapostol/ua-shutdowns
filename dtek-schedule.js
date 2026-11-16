'use strict';

const DtekSchedule = (() => {
  function dateKey(value = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const part = name => parts.find(item => item.type === name).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function intervals(slots) {
    if (slots.length !== 24) return null;
    const ordered = [...slots].sort((a, b) => a.start - b.start);
    const result = [];
    for (let hour = 0; hour < 24; hour++) {
      const { start, end, state } = ordered[hour];
      if (start !== hour * 60 || end !== start + 60 || !['yes', 'no', 'first', 'second'].includes(state)) return null;
      // DTEK's legend marks the half WITHOUT electricity, not the half with it.
      if (state === 'yes') continue;
      const from = start + (state === 'second' ? 30 : 0);
      const to = end - (state === 'first' ? 30 : 0);
      const previous = result[result.length - 1];
      if (previous && previous[1] === from) previous[1] = to;
      else result.push([from, to]);
    }
    return result;
  }

  function timeRange(text) {
    const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?$/);
    return match ? [Number(match[1]) * 60 + Number(match[2] || 0), Number(match[3]) * 60 + Number(match[4] || 0)] : null;
  }

  function read(root, date = dateKey()) {
    const days = root.querySelectorAll?.('#discon-fact .discon-fact-table') || [];
    const day = [...days].find(element => {
      const seconds = Number(element.getAttribute('rel'));
      return seconds > 0 && Number.isFinite(seconds) && dateKey(seconds * 1000) === date;
    });
    if (!day) return null;
    const groups = [...day.querySelectorAll('.grouptab')];
    if (!groups.length || groups.length > 2) return null;
    const lines = [];
    for (const group of groups) {
      const slots = [];
      for (const table of group.querySelectorAll('table')) {
        const headers = [...table.querySelectorAll('thead th[scope="col"]')];
        for (const row of table.querySelectorAll('tbody tr')) {
          const cells = [...row.children].filter(cell => [...cell.classList].some(name => name.startsWith('cell-')));
          const desktop = cells.length === 24 && headers.length === 24;
          if (!desktop && cells.length !== 1) return null;
          for (let index = 0; index < cells.length; index++) {
            const range = timeRange((desktop ? headers[index] : row.children[0]).textContent);
            const states = { 'cell-non-scheduled': 'yes', 'cell-scheduled': 'no',
              'cell-first-half': 'first', 'cell-second-half': 'second' };
            const state = Object.keys(states).find(name => cells[index].classList.contains(name));
            if (!range || !state) return null;
            slots.push({ start: range[0], end: range[1], state: states[state] });
          }
        }
      }
      const outages = intervals(slots);
      if (!outages) return null;
      lines.push(outages);
    }
    return { date, lines };
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }

  function shiftDate(date, offset) {
    if (!validDate(date)) return null;
    const day = new Date(date + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + offset);
    const next = day.toISOString().slice(0, 10);
    return validDate(next) ? next : null;
  }

  function readAll(root) {
    const dates = new Set();
    for (const element of root.querySelectorAll?.('#discon-fact .discon-fact-table') || []) {
      const seconds = Number(element.getAttribute('rel'));
      if (seconds > 0 && Number.isFinite(new Date(seconds * 1000).valueOf())) dates.add(dateKey(seconds * 1000));
    }
    return [...dates].sort().map(date => read(root, date)).filter(Boolean);
  }

  function forDate(address, date) {
    const stored = address.schedules?.[date];
    if (isValid(stored) && stored.date === date) return stored;
    return isValid(address.schedule) && address.schedule.date === date ? address.schedule : null;
  }

  function isValid(value) {
    if (!value || !validDate(value.date) ||
        !Array.isArray(value.lines) || !value.lines.length || value.lines.length > 2) return false;
    return value.lines.every(line => Array.isArray(line) && line.length <= 48 && line.every((range, index) =>
      Array.isArray(range) && range.length === 2 && range.every(minute => Number.isInteger(minute) && minute % 30 === 0) &&
      range[0] >= 0 && range[1] <= 1440 && range[0] < range[1] && (!index || line[index - 1][1] < range[0])));
  }

  function format(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function toText(address, region, schedule = address.schedule || forDate(address, dateKey())) {
    if (!isValid(schedule) || !region) throw new Error('Графік ще не отримано.');
    const day = new Date(schedule.date + 'T12:00:00Z');
    const weekdays = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', 'п’ятницю', 'суботу'];
    const parts = new Intl.DateTimeFormat('uk-UA', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv'
    }).formatToParts(day);
    const part = name => parts.find(item => item.type === name).value;
    const weekday = day.getUTCDay();
    const place = [...new Set([region.name.replace(/ область$/, ' обл.'), address.city])].join(', ');
    const queue = schedule.queue === undefined ? address.queue : schedule.queue;
    const header = `Відключення світла ${weekday === 2 ? 'у' : 'в'} ${weekdays[weekday]}, ${part('day')} ${part('month')} ${part('year')} (${place}, черга ${queue || '—'}):`;
    const rows = [header];
    schedule.lines.forEach((line, index) => {
      if (schedule.lines.length > 1) rows.push(`Лінія ${index + 1}:`);
      if (!line.length) rows.push('Без відключень');
      for (const [start, end] of line) rows.push(`${format(start)} – ${format(end)}`);
    });
    return rows.join('\n');
  }

  return { dateKey, validDate, shiftDate, intervals, read, readAll, forDate, isValid, format, toText };
})();
