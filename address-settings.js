'use strict';

const AddressSettings = (() => {
  function validate(address, allowUnassigned = false) {
    const region = DtekSites.get(address?.region);
    if (!region && !(allowUnassigned && address?.region === '')) throw new Error('Оберіть регіональне представництво.');
    const result = { region: region?.id || '' };
    for (const field of ['city', 'street', 'house']) {
      const value = field === 'city' && region?.city ? region.city : address?.[field];
      if (typeof value !== 'string' || !value.trim()) throw new Error('Заповніть місто, вулицю та номер будинку.');
      result[field] = value.trim().replace(/\s+/g, ' ');
    }
    return result;
  }

  function locked(work) {
    // Extension popups share an origin, so concurrent windows cannot overwrite
    // each other's edits. Content scripts only read the address collection.
    return globalThis.navigator?.locks ? navigator.locks.request('ua-shutdowns-addresses', work) : work();
  }

  async function readList(persistMigration = true) {
    const data = await chrome.storage.local.get(['addresses', 'address']);
    if (data.addresses !== undefined) {
      if (!Array.isArray(data.addresses)) throw new Error('Не вдалося прочитати список адрес.');
      return data.addresses.map(item => {
        if (typeof item?.id !== 'string' || !item.id) throw new Error('Пошкоджено запис адреси.');
        return { id: item.id, ...validate(item, true) };
      });
    }
    if (data.address == null) return [];
    // Old versions did not store a region. Preserve the address and ask the user
    // to assign it rather than guessing a regional operator from a city name.
    const migrated = [{ id: 'legacy-address', ...validate({ ...data.address, region: '' }, true) }];
    if (persistMigration) await chrome.storage.local.set({ addresses: migrated });
    return migrated;
  }

  return {
    list: () => locked(() => readList()),
    async upsert(address, id) {
      const value = validate(address);
      return locked(async () => {
        const addresses = await readList();
        const index = addresses.findIndex(item => item.id === id);
        if (id && index === -1) throw new Error('Адресу вже видалено.');
        const duplicate = addresses.find(item => item.id !== id && item.region === value.region &&
          ['city', 'street', 'house'].every(field => item[field].toLocaleLowerCase('uk') === value[field].toLocaleLowerCase('uk')));
        if (duplicate) throw new Error('Таку адресу вже додано.');
        const saved = { id: id || crypto.randomUUID(), ...value };
        if (index === -1) addresses.push(saved); else addresses[index] = saved;
        await chrome.storage.local.set({ addresses });
        return saved;
      });
    },
    async remove(id) {
      return locked(async () => {
        const addresses = await readList();
        await chrome.storage.local.set({ addresses: addresses.filter(item => item.id !== id) });
      });
    },
    async forPage(value) {
      const region = DtekSites.forUrl(value);
      if (!region) return null;
      const addresses = await readList(false);
      const id = new URLSearchParams(new URL(value).hash.slice(1)).get('ua-shutdowns-address');
      // An explicit ID must match this region. A missing/deleted ID must never
      // silently open a different household's schedule.
      if (id !== null) return addresses.find(item => item.id === id && item.region === region.id) || null;
      return addresses.find(item => item.region === region.id) || null;
    },
    async loadPreferences() {
      const { autoClosePopups } = await chrome.storage.local.get('autoClosePopups');
      return { autoClosePopups: autoClosePopups === true };
    },
    async savePreferences(preferences) {
      await chrome.storage.local.set({ autoClosePopups: preferences.autoClosePopups === true });
    }
  };
})();
