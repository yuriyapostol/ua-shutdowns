'use strict';

const AddressSettings = (() => {
  function validate(address) {
    const result = {};
    for (const field of ['city', 'street', 'house']) {
      if (typeof address?.[field] !== 'string' || !address[field].trim()) {
        throw new Error('Заповніть місто, вулицю та номер будинку.');
      }
      result[field] = address[field].trim().replace(/\s+/g, ' ');
    }
    return result;
  }

  return {
    async load() {
      const { address } = await chrome.storage.local.get('address');
      return address == null ? null : validate(address);
    },
    async loadPreferences() {
      const { autoClosePopups } = await chrome.storage.local.get('autoClosePopups');
      return { autoClosePopups: autoClosePopups === true };
    },
    async savePreferences(preferences) {
      await chrome.storage.local.set({ autoClosePopups: preferences.autoClosePopups === true });
    },
    async save(address, preferences) {
      const value = validate(address);
      const values = { address: value };
      if (preferences !== undefined) values.autoClosePopups = preferences.autoClosePopups === true;
      await chrome.storage.local.set(values);
      return value;
    }
  };
})();
