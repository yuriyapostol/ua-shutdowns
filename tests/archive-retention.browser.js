// Run with popup.html and in-memory storage fixtures; never touches a real saved profile.
async () => {
  if (!window.previewData || !window.navigationCalls) throw new Error('In-memory archive fixtures required');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Archive operation did not finish');
  };
  const byId = id => document.getElementById(id);
  const set = (id, value) => { byId(id).value = value; byId(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const original = (await AddressSettings.list()).find(item => item.id === 'fixture-1');
  const history = JSON.stringify(original.schedules);
  const findCard = () => [...document.querySelectorAll('.address-card')].find(item =>
    item.querySelector('strong').textContent === `${original.street}, ${original.house}`);
  findCard().querySelector('.edit-address').click();
  byId('delete-address').click();
  assert(!byId('delete-address-archive').checked, 'Archive deletion must default to off');
  byId('delete-address-archive').click();
  byId('cancel-delete').click();
  assert((await AddressSettings.list()).some(item => item.id === original.id), 'Cancel must preserve the address');
  byId('delete-address').click();
  assert(!byId('delete-address-archive').checked, 'Reopening confirmation must reset destructive consent');
  byId('confirm-delete').click();
  await wait(() => !byId('home-view').hidden && !byId('add-address').disabled);
  assert(!(await AddressSettings.list()).some(item => item.id === original.id), 'Default deletion must remove only the profile');
  assert(Object.values(previewData.addressArchives).some(item => JSON.stringify(item.schedules) === history), 'Default deletion must retain history');
  byId('add-address').click();
  for (const key of ['region', 'city', 'street', 'house']) set(key, original[key]);
  byId('address-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => !byId('home-view').hidden && !byId('add-address').disabled);
  const restored = (await AddressSettings.list()).find(item => item.street === original.street && item.house === original.house);
  assert(restored.id !== original.id && JSON.stringify(restored.schedules) === history, 'Re-adding must restore the old archive with a new profile ID');
  findCard().querySelector('.edit-address').click();
  byId('delete-address').click();
  byId('delete-address-archive').click();
  const before = JSON.stringify(previewData);
  const write = chrome.storage.local.set;
  chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  byId('confirm-delete').click();
  await wait(() => byId('status').dataset.error === 'true' && !byId('confirm-delete').disabled);
  assert(JSON.stringify(previewData) === before, 'A failed purge must preserve the profile and archive');
  assert(byId('delete-address-archive').checked, 'A failed purge must preserve the selected option for retry');
  chrome.storage.local.set = write;
  byId('confirm-delete').click();
  await wait(() => !byId('home-view').hidden && !byId('add-address').disabled);
  const clean = await AddressSettings.upsert(original);
  assert(!clean.schedules && !clean.queue, 'Explicit archive deletion must prevent restoring old data');
  return { passed: true, checks: 'default retention, cancel/reset, re-add restoration, explicit purge, write failure' };
}
