// Run in a Ukrainian popup preview with isolated in-memory storage fixtures.
async () => {
  if (!window.previewData || !window.navigationCalls) throw new Error('In-memory archive fixtures required');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Archive operation did not finish');
  };
  const el = id => document.getElementById(id);
  const original = (await AddressSettings.list()).find(item => item.id === 'fixture-1');
  const oldSnapshotCount = (await AddressSettings.archives()).reduce((count, archive) => count + Object.values(archive.days).flat().length, 0);
  const findCard = () => [...document.querySelectorAll('.address-card')].find(item => item.querySelector('strong').textContent === `${original.street}, ${original.house}`);
  findCard().querySelector('.edit-address').click();
  el('delete-address').click(); el('nav-back').click();
  assert((await AddressSettings.list()).some(item => item.id === original.id), 'Cancel preserves address');
  el('delete-address').click(); el('confirm-delete').click();
  await wait(() => !el('home-view').hidden && !el('add-address').disabled);
  assert(!(await AddressSettings.list()).some(item => item.id === original.id), 'Address removed');
  assert(!previewData.scheduleData.histories[original.id], 'Private links removed');
  assert((await AddressSettings.archives()).reduce((count, archive) => count + Object.values(archive.days).flat().length, 0) === oldSnapshotCount, 'Group snapshots retained');
  el('open-settings').click(); el('open-archives').click();
  await wait(() => !el('archives-view').hidden && !el('open-archives').disabled);
  assert(el('archive-list').querySelector('button'), 'Retained archives available in settings');
  el('archive-list').querySelector('button').click();
  assert(!el('archive-delete-view').hidden, 'Delete icon opens confirmation');
  el('nav-back').click();
  await wait(() => !el('archives-view').hidden && !el('nav-back').disabled);
  assert(el('archive-list').querySelector('.archive-counts').textContent, 'Saved days and record counts shown');
  el('archive-list').querySelector('button').click();
  const before = JSON.stringify(previewData);
  const write = chrome.storage.local.set;
  chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  el('confirm-archive-delete').click();
  await wait(() => el('status').dataset.error === 'true' && !el('confirm-archive-delete').disabled);
  assert(!el('archive-delete-view').hidden && JSON.stringify(previewData) === before, 'Failed deletion preserves all data');
  chrome.storage.local.set = write;
  el('confirm-archive-delete').click();
  await wait(() => !el('archives-view').hidden && !el('open-archives').disabled);
  assert((await AddressSettings.archives()).length === 0, 'Explicit shared archive deletion succeeds');
  el('nav-back').click();
  assert(!el('settings-view').hidden, 'Back goes to settings');
  return { passed: true, checks: 'retention, private link removal, settings list, counts, cancellation, failure, deletion' };
}
