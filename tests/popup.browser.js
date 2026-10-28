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
  const submit = () => byId('address-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert(document.querySelectorAll('.address-group').length === 2, 'Addresses must be grouped by region');
  byId('add-address').click();
  assert(!byId('form-view').hidden && byId('home-view').hidden, 'Add screen must be separate');
  set('region','dnem'); set('city','Тестове місто'); set('street','Тестова <b>назва</b>'); set('house','45');
  submit();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.addresses.length === 4, 'Address must be saved');
  assert(document.querySelectorAll('.address-group').length === 3, 'New group must appear');
  assert(!document.querySelector('.address-card b'), 'Saved text must not be rendered as HTML');
  const saved = window.previewData.addresses.find(a=>a.house==='45');
  const findCard = house => [...document.querySelectorAll('.address-card')].find(e=>e.querySelector('strong').textContent.endsWith(', '+house));
  findCard('45').querySelector('.edit-address').click();
  assert(byId('house').value === '45', 'Edit screen must load current values');
  set('region','kem');
  assert(byId('city').readOnly && byId('city').value==='Київ', 'Kyiv city must be fixed');
  set('region','dnem');
  assert(!byId('city').readOnly && byId('city').value==='Тестове місто', 'Switching away from Kyiv must restore the draft city');
  set('house','46'); submit();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.addresses.find(a=>a.id===saved.id).house==='46', 'Edit must preserve ID');
  byId('open-settings').click();
  assert(!byId('settings-view').hidden && byId('form-view').hidden, 'Settings must be a separate screen');
  byId('auto-close-popups').click();
  await wait(()=>window.previewData.autoClosePopups===false && !byId('nav-back').disabled);
  byId('nav-back').click();
  findCard('46').querySelector('.address-open').click();
  await wait(()=>window.navigationCalls.length>0);
  assert(window.navigationCalls[0].type==='create', 'An unrelated tab must be preserved');
  assert(window.navigationCalls[0].url.includes('dtek-dnem.com.ua'), 'Address must open the matching regional site');
  assert(window.navigationCalls[0].url.includes(saved.id), 'Tab must receive this exact address ID');
  await wait(()=>!byId('add-address').disabled);
  findCard('46').querySelector('.edit-address').click();
  byId('delete-address').click();
  assert(!byId('delete-confirmation').hidden, 'Deletion requires confirmation');
  byId('cancel-delete').click();
  assert(window.previewData.addresses.length===4, 'Cancelling must preserve the address');
  byId('delete-address').click(); byId('confirm-delete').click();
  await wait(()=>!byId('home-view').hidden);
  assert(window.previewData.addresses.length===3, 'Confirmed deletion must persist');
  assert(!window.previewData.addresses.some(a=>a.id===saved.id), 'The correct address must be removed');
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
  assert(window.previewData.addresses.find(a=>a.id==='fixture-1').house==='12 А', 'A failed save must not change storage');
  chrome.storage.local.set = write;
  byId('nav-back').click();
  return { passed: true, checks: 'grouping, add, edit, region changes, settings, opening, delete, text escaping' };
}
