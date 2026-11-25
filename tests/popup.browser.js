// Run against popup.html with in-memory chrome.storage and chrome.tabs fixtures.
// The guard prevents this test from touching a real extension's saved addresses.
async () => {
  if (!window.previewData || !window.navigationCalls) throw new Error('In-memory preview fixtures required');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(r=>setTimeout(r,10)); }
    throw new Error('UI operation did not finish');
  };
  const byId = id => document.getElementById(id);
  const set = (id, value) => { byId(id).value = value; byId(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const submit = () => {
    byId('address-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    if (!byId('identity-confirm-view').hidden) byId('confirm-address-correction').click();
  };
  assert(document.querySelectorAll('.address-group').length === 2, 'Addresses must be grouped by region');
  const firstCard = document.querySelector('.address-open');
  assert(firstCard.children[0].classList.contains('address-city') && firstCard.children[1].tagName==='STRONG' &&
    firstCard.children[2].classList.contains('address-queue'), 'Cards must show city, address, then queue');
  assert(getComputedStyle(document.querySelector('.address-group h2')).fontWeight==='400', 'Region titles must be regular weight');
  assert(getComputedStyle(firstCard.querySelector('.address-city')).fontSize===
    getComputedStyle(firstCard.querySelector('.address-queue')).fontSize, 'City and queue must use the same font size');
  byId('add-address').click();
  assert(!byId('form-view').hidden && byId('home-view').hidden, 'Add screen must be separate');
  assert(!byId('save-address').disabled, 'The save button must be active immediately when adding an address');
  set('region','dnem'); set('city','Тестове місто'); set('street','Тестова <b>назва</b>'); set('house','45');
  submit();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.scheduleData.addresses.length === 4, 'Address must be saved');
  assert(document.querySelectorAll('.address-group').length === 3, 'New group must appear');
  assert(!document.querySelector('.address-card b'), 'Saved text must not be rendered as HTML');
  const saved = window.previewData.scheduleData.addresses.find(a=>a.house==='45');
  const findCard = house => [...document.querySelectorAll('.address-card')].find(e=>e.querySelector('strong').textContent.endsWith(', '+house));
  findCard('45').querySelector('.edit-address').click();
  assert(byId('house').value === '45', 'Edit screen must load current values');
  assert(byId('save-address').disabled, 'An unchanged address must not be saved');
  assert(getComputedStyle(byId('save-address')).backgroundColor === 'rgb(255, 227, 0)', 'An unchanged saved address must have a yellow save button');
  set('house', '45a');
  assert(!byId('save-address').disabled, 'Changing a field must enable saving');
  set('house', '45');
  assert(byId('save-address').disabled, 'Restoring the original values must disable saving');
  set('region','kem');
  assert(byId('city').readOnly && byId('city').value==='Київ', 'Kyiv city must be fixed');
  set('region','dnem');
  assert(!byId('city').readOnly && byId('city').value==='Тестове місто', 'Switching away from Kyiv must restore the draft city');
  set('house','46'); submit();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.scheduleData.addresses.find(a=>a.id===saved.id).house==='46', 'Edit must preserve ID');
  byId('open-settings').click();
  assert(!byId('settings-view').hidden && byId('form-view').hidden, 'Settings must be a separate screen');
  byId('auto-close-popups').click();
  await wait(()=>window.previewData.autoClosePopups===false && !byId('nav-back').disabled);
  byId('nav-back').click();
  findCard('46').querySelector('.address-open').click();
  await wait(()=>window.navigationCalls.length>0);
  assert(window.navigationCalls[0].type==='open-address', 'Navigation must be delegated to the worker');
  assert(window.navigationCalls[0].addressId===saved.id, 'The worker must receive this exact address ID');
  await wait(()=>!byId('add-address').disabled);
  findCard('46').querySelector('.edit-address').click();
  set('house', '46a');
  byId('delete-address').click();
  assert(!byId('delete-view').hidden && byId('form-view').hidden, 'Deletion requires a separate screen');
  assert(byId('screen-title').textContent === 'Видалення адреси', 'Deletion screen must have its own heading');
  assert(byId('delete-address-summary').textContent.includes(', 46'), 'Confirmation must identify the saved address');
  assert(byId('nav-back').getAttribute('aria-label') === 'До редагування адреси', 'Back must describe its destination');
  assert(byId('confirm-delete').querySelector('img').getAttribute('src') === 'images/delete.svg', 'Confirmation must use the existing delete icon');
  byId('nav-back').click();
  assert(!byId('form-view').hidden && byId('delete-view').hidden, 'Back must return to address editing');
  assert(byId('house').value === '46a' && !byId('save-address').disabled, 'Returning must preserve the unsaved draft');
  assert(window.previewData.scheduleData.addresses.length===4, 'Cancelling must preserve the address');
  byId('delete-address').click(); byId('confirm-delete').click();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.scheduleData.addresses.length===3, 'Confirmed deletion must persist');
  assert(!window.previewData.scheduleData.addresses.some(a=>a.id===saved.id), 'The correct address must be removed');
  const write = chrome.storage.local.set;
  chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  byId('open-settings').click();
  byId('auto-close-popups').click();
  await wait(()=>byId('status').dataset.error==='true' && !byId('nav-back').disabled);
  assert(!byId('auto-close-popups').checked, 'A failed preference save must restore the checkbox');
  byId('nav-back').click();
  findCard('12 А').querySelector('.edit-address').click();
  set('house','88'); submit();
  await wait(()=>byId('status').dataset.error==='true' && !byId('nav-back').disabled);
  assert(byId('house').value==='88', 'A failed save must preserve the edit draft');
  assert(!byId('save-address').disabled, 'A failed save must allow retrying the changed draft');
  assert(window.previewData.scheduleData.addresses.find(a=>a.id==='fixture-1').house==='12 А', 'A failed save must not change storage');
  chrome.storage.local.set = write;
  byId('nav-back').click();
  return { passed: true, checks: 'grouping, add, edit, region changes, settings, opening, delete, text escaping' };
}
