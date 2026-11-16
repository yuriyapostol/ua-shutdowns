// Run with popup.html and in-memory storage/clipboard fixtures; never writes the real clipboard.
async () => {
  if (!window.previewData || !window.copiedSchedules) throw new Error('In-memory clipboard fixtures required');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Copy operation did not finish');
  };
  const cards = [...document.querySelectorAll('.address-card')];
  const selectedDate = document.getElementById('schedule-date').value;
  const address = (await AddressSettings.list()).find(item => DtekSchedule.forDate(item, selectedDate));
  const card = cards.find(item => item.querySelector('strong').textContent === `${address.street}, ${address.house}`);
  const copy = card.querySelector('.copy-schedule');
  const actions = card.querySelector('.address-actions');
  assert(actions.children[0] === copy && actions.children[1].classList.contains('edit-address'), 'Copy must be above edit');
  assert(copy.querySelector('img').getAttribute('src') === 'images/content-copy.svg', 'Copy icon must match');
  assert(actions.children[1].querySelector('img').getAttribute('src') === 'images/edit.svg', 'Edit icon must match');
  assert(!copy.disabled, 'A current schedule can be copied');
  copy.click();
  await wait(() => copiedSchedules.length === 1);
  assert(copiedSchedules[0] === DtekSchedule.toText(address, DtekSites.get(address.region), DtekSchedule.forDate(address, selectedDate)), 'Copy must use this address and schedule date');
  await wait(() => document.getElementById('status').textContent === 'Графік скопійовано.');
  const unavailable = cards.find(item => item.querySelector('.copy-schedule').disabled);
  assert(unavailable, 'Missing/stale schedules must not be copied');
  document.getElementById('open-settings').click();
  document.getElementById('auto-close-popups').click();
  await wait(() => !document.getElementById('nav-back').disabled);
  document.getElementById('nav-back').click();
  const refreshedCards = [...document.querySelectorAll('.address-card')];
  assert(refreshedCards.some(item => item.querySelector('.copy-schedule').disabled), 'Saving settings must not enable unavailable copies');
  const write = navigator.clipboard.writeText;
  navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); };
  refreshedCards.find(item => !item.querySelector('.copy-schedule').disabled).querySelector('.copy-schedule').click();
  await wait(() => document.getElementById('status').dataset.error === 'true');
  assert(copiedSchedules.length === 1, 'A failed copy must not report success');
  navigator.clipboard.writeText = write;
  return { passed: true, checks: 'copy text, action order, icons, unavailable schedules, busy recovery, clipboard failure' };
}
