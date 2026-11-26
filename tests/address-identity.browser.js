// Run in an isolated popup preview, in either UI language.
async () => {
  if (!window.previewData) throw new Error('In-memory fixtures required');
  const el = id => document.getElementById(id);
  const assert = (value, message) => { if (!value) throw Error(message); };
  const wait = async read => {
    for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 15)); }
    throw Error('UI operation did not finish');
  };
  const original = (await AddressSettings.list())[0];
  const edit = address => [...document.querySelectorAll('.address-card')].find(card => card.querySelector('strong').textContent === `${address.street}, ${address.house}`).querySelector('.edit-address').click();
  const submit = () => el('address-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const home = () => !el('home-view').hidden && !el('add-address').disabled;
  edit(original);
  assert(!el('new-address-identity'), 'No identity checkbox in the edit form');
  el('street').value = 'вул. ' + original.street;
  el('street').dispatchEvent(new Event('input', { bubbles: true }));
  submit(); await wait(home);
  let updated = (await AddressSettings.list())[0];
  assert(updated.id === original.id && updated.schedules && updated.revision === original.revision + 1, 'Formatting retains identity/history');
  assert(updated.queueVerified === original.queueVerified, 'Formatting retains group verification');
  edit(updated);
  el('street').value = 'пров. ' + original.street;
  el('street').dispatchEvent(new Event('input', { bubbles: true }));
  const before = JSON.stringify(previewData);
  submit();
  assert(!el('identity-confirm-view').hidden, 'Explicit type changes need clarification');
  assert(el('identity-before').textContent.includes('вул.') && el('identity-after').textContent.includes('пров.'), 'Both addresses shown');
  assert(JSON.stringify(previewData) === before, 'No write before user choice');
  el('nav-back').click();
  assert(!el('form-view').hidden && el('street').value.startsWith('пров.'), 'Back preserves draft');
  submit(); el('confirm-address-correction').click(); await wait(home);
  updated = (await AddressSettings.list())[0];
  assert(updated.id === original.id && updated.schedules && !updated.queueVerified, 'Explicit correction retains history and requires group verification');
  edit(updated);
  el('house').value = original.house + 'Б';
  el('house').dispatchEvent(new Event('input', { bubbles: true }));
  submit();
  assert(!el('identity-confirm-view').hidden, 'A building letter change needs clarification');
  el('confirm-address-replacement').click(); await wait(home);
  updated = (await AddressSettings.list())[0];
  assert(updated.id !== original.id && !updated.schedules, 'Different place gets a new identity');
  el('open-settings').click();
  const language = el('interface-language');
  language.value = document.documentElement.lang === 'uk' ? 'en' : 'uk';
  language.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(() => document.documentElement.lang === language.value && !el('open-archives').disabled);
  el('open-archives').click();
  await wait(() => !el('archives-view').hidden && !el('open-archives').disabled);
  assert(el('screen-title').textContent === I18n.t('archives_title'), 'Archive title follows language choice');
  assert(el('archive-list').querySelector('.archive-counts').textContent, 'Old group archive remains available with counts');
  el('nav-back').click();
  assert(!el('settings-view').hidden, 'Archive back navigation returns to settings');
  return { passed: true, checks: 'formatting, group verification, type confirmation, cancel/draft, correction, replacement, language, retained archives' };
}
