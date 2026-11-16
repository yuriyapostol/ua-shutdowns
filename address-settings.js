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

  function validQueue(value) {
    return typeof value === 'string' && value.length <= 100 && /^\d+(?:\.\d+)?(?:, \d+(?:\.\d+)?)*$/.test(value);
  }

  function sameAddress(left, right) {
    return ['region', 'city', 'street', 'house'].every(field => left[field] === right[field]);
  }

  function scheduleHistory(item) {
    const history = {};
    const snapshot = (schedule, fallbackQueue = '') => ({ date: schedule.date,
      lines: schedule.lines.map(line => line.map(range => [...range])),
      queue: validQueue(schedule.queue) ? schedule.queue : fallbackQueue });
    for (const [date, schedule] of Object.entries(item.schedules || {})) {
      if (DtekSchedule.isValid(schedule) && date === schedule.date) history[date] = snapshot(schedule);
    }
    // Migrate the previously stored single day without replacing an archived day.
    if (DtekSchedule.isValid(item.schedule) && !history[item.schedule.date]) {
      history[item.schedule.date] = snapshot(item.schedule, validQueue(item.queue) ? item.queue : '');
    }
    return history;
  }

  function archiveKey(address) {
    const normalize = value => value.normalize('NFKC').toLocaleLowerCase('uk')
      .replace(/[’'`ʼ]/g, "'").trim().replace(/\s+/g, ' ');
    return JSON.stringify([address.region, normalize(address.city), normalize(address.street),
      normalize(address.house).replace(/\s+/g, '')]);
  }

  function archiveData(item = {}) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Не вдалося прочитати архів графіків.');
    const schedules = scheduleHistory(item);
    return { ...(validQueue(item.queue) ? { queue: item.queue } : {}),
      ...(Object.keys(schedules).length ? { schedules } : {}) };
  }

  async function writeState(addresses, archives) {
    const profiles = addresses.map(item => ({ id: item.id, ...validate(item, true) }));
    await chrome.storage.local.set({ addresses: profiles, addressArchives: archives });
  }

  async function readState(persistMigration = false) {
    const data = await chrome.storage.local.get(['addresses', 'address', 'addressArchives']);
    if (data.addressArchives !== undefined && (!data.addressArchives ||
        typeof data.addressArchives !== 'object' || Array.isArray(data.addressArchives))) {
      throw new Error('Не вдалося прочитати архів графіків.');
    }
    const archives = { ...data.addressArchives };
    let items;
    if (data.addresses !== undefined) {
      if (!Array.isArray(data.addresses)) throw new Error('Не вдалося прочитати список адрес.');
      items = data.addresses;
    } else {
      // Preserve old profiles without guessing their regional operator.
      items = data.address == null ? [] : [{ ...data.address, id: 'legacy-address', region: '' }];
    }
    const profiles = items.map(item => {
      if (typeof item?.id !== 'string' || !item.id) throw new Error('Пошкоджено запис адреси.');
      const profile = { id: item.id, ...validate(item, true) };
      const key = archiveKey(profile);
      const embedded = archiveData(item);
      const archived = archiveData(archives[key]);
      const schedules = { ...embedded.schedules, ...archived.schedules };
      const queue = archived.queue || embedded.queue;
      const merged = { ...(queue ? { queue } : {}), ...(Object.keys(schedules).length ? { schedules } : {}) };
      if (Object.keys(merged).length) archives[key] = merged;
      return profile;
    });
    if (persistMigration && (JSON.stringify(data.addresses || []) !== JSON.stringify(profiles) ||
        JSON.stringify(data.addressArchives || {}) !== JSON.stringify(archives))) {
      await writeState(profiles, archives);
    }
    const addresses = profiles.map(profile => ({ ...profile, ...archiveData(archives[archiveKey(profile)]) }));
    return { addresses, archives };
  }

  async function readList(persistMigration = true) {
    return (await readState(persistMigration)).addresses;
  }

  return {
    list: () => locked(() => readList()),
    async upsert(address, id) {
      const value = validate(address);
      return locked(async () => {
        const { addresses, archives } = await readState();
        const index = addresses.findIndex(item => item.id === id);
        if (id && index === -1) throw new Error('Адресу вже видалено.');
        const duplicate = addresses.find(item => item.id !== id && archiveKey(item) === archiveKey(value));
        if (duplicate) throw new Error('Таку адресу вже додано.');
        const saved = { id: id || crypto.randomUUID(), ...value, ...archiveData(archives[archiveKey(value)]) };
        if (index === -1) addresses.push(saved); else addresses[index] = saved;
        await writeState(addresses, archives);
        return saved;
      });
    },
    async remove(id, { deleteArchive = false } = {}) {
      return locked(async () => {
        const { addresses, archives } = await readState();
        const saved = addresses.find(item => item.id === id);
        if (!saved) return;
        if (deleteArchive) delete archives[archiveKey(saved)];
        await writeState(addresses.filter(item => item.id !== id), archives);
      });
    },
    async saveQueue(address, queue, schedule, schedules = []) {
      if (queue !== '' && !validQueue(queue)) throw new Error('Некоректна черга.');
      if (schedule != null && !DtekSchedule.isValid(schedule)) throw new Error('Некоректний графік.');
      if (!Array.isArray(schedules) || schedules.length > 2 || schedules.some(item => !DtekSchedule.isValid(item))) {
        throw new Error('Некоректні графіки.');
      }
      return locked(async () => {
        const { addresses, archives } = await readState();
        const saved = addresses.find(item => item.id === address.id);
        // A delayed page response must not attach a queue to an edited/deleted address.
        if (!saved || !sameAddress(saved, address)) return;
        const before = JSON.stringify(saved);
        if (queue) saved.queue = queue;
        else delete saved.queue;
        const history = saved.schedules || {};
        const incoming = new Map([...(schedule ? [schedule] : []), ...schedules].map(item => [item.date, item]));
        for (const item of incoming.values()) {
          // Past days are snapshots; a stale site tab must not rewrite the archive.
          if (item.date < DtekSchedule.dateKey() && history[item.date]) continue;
          history[item.date] = { date: item.date, lines: item.lines, queue };
        }
        if (Object.keys(history).length) saved.schedules = history;
        else delete saved.schedules;
        if (JSON.stringify(saved) === before) return;
        archives[archiveKey(saved)] = archiveData(saved);
        await writeState(addresses, archives);
      });
    },
    async forPage(value, id = null) {
      const region = DtekSites.forUrl(value);
      if (!region) return null;
      const addresses = await readList(false);
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
      const enabled = preferences.autoClosePopups === true;
      await chrome.storage.local.set({ autoClosePopups: enabled, ...(enabled ? { popupOfferPending: false } : {}) });
    },
    async recordPopupDetection() {
      const data = await chrome.storage.local.get(['autoClosePopups', 'popupOfferPending', 'popupOfferDismissedAt']);
      if (data.autoClosePopups === true || data.popupOfferPending === true ||
          (data.popupOfferDismissedAt && Date.now() < data.popupOfferDismissedAt + 31 * 24 * 60 * 60 * 1000)) return;
      await chrome.storage.local.set({ popupOfferPending: true, popupOfferAutoOpened: false });
    },
    async shouldOfferPopupClosing() {
      const data = await chrome.storage.local.get(['autoClosePopups', 'popupOfferPending', 'popupOfferDismissedAt']);
      return data.autoClosePopups !== true && data.popupOfferPending === true &&
        (!data.popupOfferDismissedAt || Date.now() >= data.popupOfferDismissedAt + 31 * 24 * 60 * 60 * 1000);
    },
    async dismissPopupOffer() {
      await chrome.storage.local.set({ popupOfferPending: false, popupOfferDismissedAt: Date.now() });
    }
  };
})();
