// Run with popup.html and in-memory storage/clipboard fixtures.
async () => {
  if (!window.previewData || !window.copiedSchedules) throw new Error('In-memory date fixtures required');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Date operation did not finish');
  };
  const byId = id => document.getElementById(id);
  const date = byId('schedule-date');
  const today = DtekSchedule.dateKey();
  const yesterday = DtekSchedule.shiftDate(today, -1);
  const tomorrow = DtekSchedule.shiftDate(today, 1);
  const choose = value => { date.value = value; date.dispatchEvent(new Event('change', { bubbles: true })); };
  const selectedShortcut = () => [...document.querySelectorAll('.date-shortcut[aria-pressed="true"]')].map(item => item.id).join(',');
  const address = (await AddressSettings.list()).find(item => item.id === 'fixture-1');
  const card = () => [...document.querySelectorAll('.address-card')].find(item =>
    item.querySelector('strong').textContent === `${address.street}, ${address.house}`);
  assert(date.type === 'date' && date.value === today, 'The calendar must start on today');
  assert(selectedShortcut() === 'date-today', 'Today shortcut must start selected');
  assert([...document.querySelectorAll('.date-shortcut')].every(item => item.getBoundingClientRect().height <= 26), 'Date shortcuts must remain compact');
  byId('date-tomorrow').click();
  assert(date.value === tomorrow && selectedShortcut() === 'date-tomorrow', 'Tomorrow shortcut must select tomorrow');
  byId('date-today').click();
  assert(date.value === today && selectedShortcut() === 'date-today', 'Today shortcut must return to today');
  const showPicker = date.showPicker;
  let pickerCalls = 0;
  date.showPicker = () => { pickerCalls++; };
  byId('date-other').click();
  assert(pickerCalls === 1 && date.value === today && selectedShortcut() === 'date-today', 'Other date must open the picker without changing the date prematurely');
  date.showPicker = showPicker;
  byId('date-previous').click();
  assert(date.value === yesterday, 'Previous must select yesterday');
  assert(selectedShortcut() === 'date-other', 'Previous day must select the other-date shortcut');
  assert(card().querySelector('.outage-interval').textContent === '01:00 – 02:00', 'Yesterday must show its archived intervals');
  assert(card().querySelector('.address-queue').textContent === 'Черга: 4.2', 'Yesterday must show its historical queue');
  const count = copiedSchedules.length;
  card().querySelector('.copy-schedule').click();
  await wait(() => copiedSchedules.length === count + 1);
  assert(copiedSchedules[count] === DtekSchedule.toText(address, DtekSites.get(address.region), address.schedules[yesterday]), 'Historical copy must use the selected day');
  byId('date-next').click();
  assert(date.value === today, 'Next must return to today');
  assert(selectedShortcut() === 'date-today', 'Arrow navigation must synchronize the today shortcut');
  choose(tomorrow);
  assert(date.value === tomorrow && card().querySelector('.outage-note').textContent === 'Без відключень', 'The calendar must select tomorrow');
  assert(selectedShortcut() === 'date-tomorrow', 'Calendar selection must synchronize the tomorrow shortcut');
  choose(DtekSchedule.shiftDate(today, -10));
  assert(card().querySelector('.outage-note').textContent === 'Графік не збережено', 'Unknown historical data must not show another day');
  assert(card().querySelector('.copy-schedule').disabled, 'Missing historical data cannot be copied');
  assert(selectedShortcut() === 'date-other', 'A calendar date outside today/tomorrow must select other');
  choose(yesterday);
  const original = structuredClone(address.schedules[yesterday]);
  await AddressSettings.saveQueue(address, '6.1', { date: today, lines: [[[180, 240]]] });
  await wait(() => card().querySelector('.outage-interval').textContent === '01:00 – 02:00');
  assert(date.value === yesterday && card().querySelector('.outage-interval').textContent === '01:00 – 02:00', 'A live update must keep the selected historical day');
  assert(JSON.stringify((await AddressSettings.list()).find(item => item.id === address.id).schedules[yesterday]) === JSON.stringify(original), 'Today updates must preserve yesterday');
  choose(today);
  await wait(() => card().querySelector('.outage-interval').textContent === '03:00 – 04:00');
  assert(card().querySelector('.address-queue').textContent === 'Черга: 6.1', 'Today must show its new queue');
  choose('');
  assert(date.value === today, 'An empty calendar value must preserve the selected date');
  return { passed: true, checks: 'arrows, calendar, history, historical queue/copy, missing days, live updates' };
}
