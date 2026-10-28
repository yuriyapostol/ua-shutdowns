(function() {
  'use strict';

  const form = document.getElementById('address-form');
  const fieldset = document.getElementById('address-fields');
  const status = document.getElementById('status');
  const autoClosePopups = document.getElementById('auto-close-popups');
  const inputs = Object.fromEntries(['city', 'street', 'house'].map(field =>
    [field, document.getElementById(field)]));
  let saving = false;
  autoClosePopups.addEventListener('change', async () => {
    if (saving || fieldset.disabled) return;
    const checked = autoClosePopups.checked;
    saving = true;
    fieldset.disabled = true;
    autoClosePopups.disabled = true;
    showStatus('Збереження…');
    try {
      await AddressSettings.savePreferences({ autoClosePopups: checked });
      showStatus('Налаштування спливаючих вікон збережено.');
    } catch {
      autoClosePopups.checked = !checked;
      showStatus('Не вдалося зберегти налаштування спливаючих вікон. Спробуйте ще раз.', true);
    } finally {
      saving = false;
      fieldset.disabled = false;
      autoClosePopups.disabled = false;
    }
  });

  function showStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function fill(address) {
    for (const field of Object.keys(inputs)) inputs[field].value = address?.[field] || '';
  }

  form.addEventListener('input', () => showStatus('Зміни ще не збережено.'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || fieldset.disabled) return;
    saving = true;
    fieldset.disabled = true;
    showStatus('Збереження…');
    try {
      const address = await AddressSettings.save(Object.fromEntries(
        Object.entries(inputs).map(([field, input]) => [field, input.value])
      ), { autoClosePopups: autoClosePopups.checked });
      fill(address);
      showStatus('Налаштування збережено.');
    } catch (error) {
      showStatus(error.message === 'Заповніть місто, вулицю та номер будинку.'
        ? error.message : 'Не вдалося зберегти налаштування. Спробуйте ще раз.', true);
    } finally {
      saving = false;
      fieldset.disabled = false;
    }
  });

  async function load() {
    try {
      const [address, preferences] = await Promise.all([
        AddressSettings.load(), AddressSettings.loadPreferences()
      ]);
      fill(address);
      autoClosePopups.checked = preferences.autoClosePopups;
      showStatus('');
    } catch {
      showStatus('Не вдалося завантажити налаштування. Перевірте їх та спробуйте зберегти.', true);
    } finally {
      fieldset.disabled = false;
    }
  }

  load();
})();
