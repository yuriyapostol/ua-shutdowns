'use strict';

// The single storage value is committed atomically. Only profiles contain streets/houses.
const ScheduleStorage = (() => {
  const empty = () => ({ schemaVersion: 2, addresses: [], localities: {}, archives: {}, histories: {} });
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('uk')
    .replace(/[’'`ʼ]/g, "'").trim().replace(/\s+/g, ' ');
  const cityName = value => normalize(value).replace(/^(?:(?:м\.|с\.|смт\.?)\s*|(?:місто|село|селище)\s+)/u, '');
  const validQueue = value => typeof value === 'string' && value.length <= 100 &&
    (value === '' || /^\d+(?:\.\d+)?(?:, \d+(?:\.\d+)?)*$/.test(value));
  // Preserve order: multiple groups may describe different supply lines.
  const queueName = value => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))].join(', ');
  const id = () => crypto.randomUUID();
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9-]+$/.test(value) && !['constructor', 'prototype'].includes(value);
  const fail = () => { throw new Error(I18n.t('schedule_archive_read_error')); };
  function profile(value, allowUnassigned = false) {
    const region = DtekSites.get(value?.region);
    if (!region && !(allowUnassigned && value?.region === '')) throw new Error(I18n.t('address_validation_region_required'));
    const result = { region: region?.id || '' };
    for (const field of ['city', 'street', 'house']) {
      const text = field === 'city' && region?.city ? region.city : value?.[field];
      if (typeof text !== 'string' || !text.trim()) throw new Error(I18n.t('address_validation_fields_required'));
      result[field] = text.trim().replace(/\s+/g, ' ');
    }
    return result;
  }
  function localityType(value) {
    const text = normalize(value);
    if (/^(?:м\.\s*|місто\s+)/u.test(text)) return 'city';
    if (/^(?:с\.\s*|село\s+)/u.test(text)) return 'village';
    if (/^(?:смт\.?\s*|селище\s+)/u.test(text)) return 'settlement';
    return null;
  }
  function locality(state, region, city) {
    const matches = Object.values(state.localities).filter(item => item.region === region && (!localityType(city) || !localityType(item.name) || localityType(city) === localityType(item.name)) && [item.name, ...item.aliases].some(name => cityName(name) === cityName(city)));
    if (matches.length > 1) throw new Error(I18n.t('locality_ambiguous'));
    let place = matches[0];
    if (!place) {
      place = { id: id(), region, name: city.trim(), aliases: [] };
      state.localities[place.id] = place;
    }
    return place;
  }
  function archive(state, localityId, queue) {
    queue = queueName(queue);
    let result = Object.values(state.archives).find(item => item.localityId === localityId && item.queue === queue);
    if (!result) {
      result = { id: id(), localityId, queue, days: {} };
      state.archives[result.id] = result;
    }
    return result;
  }
  function snapshot(archive, schedule, queue, observedAt = Date.now()) {
    const days = archive.days[schedule.date] ||= [];
    const lines = schedule.lines.map(line => line.map(range => [...range]));
    let result = days.find(item => JSON.stringify(item.lines) === JSON.stringify(lines) && item.queue === queue);
    if (!result) {
      result = { id: id(), date: schedule.date, queue, lines, observedAt };
      days.push(result);
    } else {
      // A schedule can return to an earlier version during the day.
      result.observedAt = observedAt;
      days.splice(days.indexOf(result), 1);
      days.push(result);
    }
    return { archiveId: archive.id };
  }
  function latest(versions) {
    let result = null;
    for (const version of versions || []) {
      if (!result || version.observedAt !== null &&
          (result.observedAt === null || version.observedAt >= result.observedAt) ||
          version.observedAt === null && result.observedAt === null) result = version;
    }
    return result;
  }
  function materialize(state, item) {
    const schedules = {};
    for (const [date, ref] of Object.entries(state.histories[item.id] || {})) {
      const saved = latest(state.archives[ref.archiveId]?.days[date]);
      if (saved) schedules[date] = { date, lines: saved.lines, queue: saved.queue };
    }
    // Existing installations can have missing links for days with multiple versions.
    const current = item.queueVerified && Object.values(state.archives).find(archive =>
      archive.localityId === item.localityId && archive.queue === item.queue);
    if (current) for (const [date, versions] of Object.entries(current.days)) {
      const saved = latest(versions);
      if (!schedules[date] && saved) schedules[date] = { date, lines: saved.lines, queue: saved.queue };
    }
    return { ...item, ...(Object.keys(schedules).length ? { schedules } : {}) };
  }
  function validate(state) {
    if (!record(state) || state.schemaVersion !== 2 || !Array.isArray(state.addresses) ||
        !['localities', 'archives', 'histories'].every(key => record(state[key])) ||
        Object.keys(state).some(key => !['schemaVersion', 'addresses', 'localities', 'archives', 'histories'].includes(key))) fail();
    const ids = new Set();
    for (const a of state.addresses) {
      if (!safeId(a.id) || ids.has(a.id) || !Number.isSafeInteger(a.revision) || a.revision < 1 ||
          !validQueue(a.queue) || typeof a.queueVerified !== 'boolean' ||
          Object.keys(a).some(key => !['id', 'revision', 'region', 'city', 'street', 'house', 'localityId', 'queue', 'queueVerified'].includes(key))) fail();
      profile(a, true); ids.add(a.id);
      if (!state.localities[a.localityId] || state.localities[a.localityId].region !== a.region) fail();
    }
    for (const [key, place] of Object.entries(state.localities)) {
      if (!Array.isArray(place.aliases) || place.aliases.some(alias => typeof alias !== 'string' || !alias.trim()) || !safeId(key) || place.id !== key || typeof place.name !== 'string' || !place.name.trim() ||
          (place.region !== '' && !DtekSites.get(place.region)) || Object.keys(place).some(k => !['id', 'region', 'name', 'aliases'].includes(k))) fail();
    }
    const snapshots = new Set();
    for (const [key, a] of Object.entries(state.archives)) {
      if (!safeId(key) || a.id !== key || !state.localities[a.localityId] || !validQueue(a.queue) || !record(a.days) ||
          Object.keys(a).some(k => !['id', 'localityId', 'queue', 'days'].includes(k))) fail();
      for (const [date, entries] of Object.entries(a.days)) {
        if (!DtekSchedule.validDate(date) || !Array.isArray(entries) || !entries.length) fail();
        for (const item of entries) {
          if (!safeId(item.id) || snapshots.has(item.id) || !DtekSchedule.isValid(item) || item.date !== date || item.queue !== a.queue ||
              !(item.observedAt === null || Number.isFinite(item.observedAt) && item.observedAt >= 0) ||
              Object.keys(item).some(k => !['id', 'date', 'queue', 'lines', 'observedAt'].includes(k))) fail();
          snapshots.add(item.id);
        }
      }
    }
    for (const [key, history] of Object.entries(state.histories)) {
      if (!ids.has(key) || !record(history)) fail();
      for (const [date, ref] of Object.entries(history)) {
        if (!DtekSchedule.validDate(date) || !record(ref) || Object.keys(ref).some(k => k !== 'archiveId') ||
            !safeId(ref.archiveId) || !state.archives[ref.archiveId]?.days[date]) fail();
      }
    }
    return state;
  }
  return { empty, normalize, cityName, validQueue, queueName, profile, locality, archive, snapshot, latest, materialize, validate, id };
})();

const AddressSettings = (() => {
  const validRetention = days => Number.isSafeInteger(days) && days >= 1;
  const retentionDays = days => validRetention(days) ? days : 365;
  function normalizeLocalities(state) {
    let changed = false;
    for (const place of Object.values(state.localities)) {
      const city = DtekSites.get(place.region)?.city;
      if (city && place.name !== city && ScheduleStorage.normalize(place.name) === ScheduleStorage.normalize(city)) {
        if (!place.aliases.includes(place.name)) place.aliases.push(place.name);
        place.name = city;
        changed = true;
      }
    }
    return changed;
  }
  function prune(state, days) {
    const cutoff = DtekSchedule.shiftDate(DtekSchedule.dateKey(), -Math.min(days - 1, 3652058)) || '0001-01-01';
    let changed = false;
    for (const archive of Object.values(state.archives)) {
      for (const date of Object.keys(archive.days)) {
        if (date < cutoff) { delete archive.days[date]; changed = true; }
      }
      if (!Object.keys(archive.days).length) { delete state.archives[archive.id]; changed = true; }
    }
    for (const history of Object.values(state.histories)) {
      for (const [date, ref] of Object.entries(history)) {
        if (!state.archives[ref.archiveId]?.days[date]) { delete history[date]; changed = true; }
      }
    }
    return changed;
  }
  function locked(work) {
    return globalThis.navigator?.locks ? navigator.locks.request('ua-shutdowns-addresses', work) : work();
  }
  async function readState(cleanup = true) {
    const data = await chrome.storage.local.get(['scheduleData', 'addresses', 'address', 'addressArchives', 'archiveRetentionDays']);
    // Reject unsupported or mixed formats without overwriting saved data.
    const hasLegacy = data.address != null || data.addresses !== undefined && (!Array.isArray(data.addresses) || data.addresses.length) ||
      data.addressArchives !== undefined && (!data.addressArchives || typeof data.addressArchives !== 'object' ||
        Array.isArray(data.addressArchives) || Object.keys(data.addressArchives).length);
    if (hasLegacy) throw new Error(I18n.t('storage_format_unsupported'));
    const state = data.scheduleData === undefined ? ScheduleStorage.empty() : ScheduleStorage.validate(data.scheduleData);
    if (cleanup) {
      const renamed = normalizeLocalities(state);
      const expired = prune(state, retentionDays(data.archiveRetentionDays));
      if (renamed || expired) await writeState(state);
    }
    return state;
  }
  async function writeState(state) {
    const { archiveRetentionDays } = await chrome.storage.local.get('archiveRetentionDays');
    normalizeLocalities(state);
    prune(state, retentionDays(archiveRetentionDays));
    ScheduleStorage.validate(state);
    await chrome.storage.local.set({ scheduleData: state });
  }
  function sameAddress(left, right) {
    return ['region', 'city', 'street', 'house'].every(field => left[field] === right[field]) && left.revision === right.revision;
  }
  const list = async () => {
    const state = await readState();
    return state.addresses.map(item => ScheduleStorage.materialize(state, item));
  };
  return {
    list: () => locked(list),
    async upsert(address, id, { newIdentity = false, expectedRevision } = {}) {
      const value = ScheduleStorage.profile(address);
      return locked(async () => {
        const state = await readState();
        const index = state.addresses.findIndex(item => item.id === id);
        if (id && index < 0) throw new Error(I18n.t('address_save_already_deleted_error'));
        const duplicate = state.addresses.some(item => item.id !== id && ['region', 'city', 'street', 'house'].every(key =>
          ScheduleStorage.normalize(item[key]) === ScheduleStorage.normalize(value[key])));
        if (duplicate) throw new Error(I18n.t('address_save_duplicate_error'));
        const previous = state.addresses[index];
        if (previous && expectedRevision !== undefined && previous.revision !== expectedRevision) {
          throw new Error(I18n.t('address_edit_conflict'));
        }
        const changed = previous && ['region', 'city', 'street', 'house'].some(key => previous[key] !== value[key]);
        const keepVerifiedQueue = previous && !newIdentity && !AddressIdentity.requiresConfirmation(previous, value);
        let place;
        if (previous && !newIdentity && previous.region === value.region) {
          place = state.localities[previous.localityId];
          // An edit of the same place can correct its name without orphaning group archives.
          if (previous.city !== value.city && place.name !== value.city) {
            if (!place.aliases.includes(place.name)) place.aliases.push(place.name);
            place.name = value.city;
          }
        } else place = ScheduleStorage.locality(state, value.region, value.city);
        const saved = { id: !newIdentity && previous ? previous.id : ScheduleStorage.id(),
          revision: !newIdentity && previous ? previous.revision + (changed ? 1 : 0) : 1,
          ...value, localityId: place.id,
          queue: keepVerifiedQueue ? previous.queue : '',
          queueVerified: keepVerifiedQueue ? previous.queueVerified : false };
        if (newIdentity && previous) delete state.histories[previous.id];
        if (index < 0) state.addresses.push(saved); else state.addresses[index] = saved;
        await writeState(state);
        return ScheduleStorage.materialize(state, saved);
      });
    },
    async remove(id) {
      return locked(async () => {
        const state = await readState();
        state.addresses = state.addresses.filter(item => item.id !== id);
        delete state.histories[id];
        await writeState(state);
      });
    },
    async saveQueue(address, queue, schedule, schedules = []) {
      if (!ScheduleStorage.validQueue(queue)) throw new Error(I18n.t('schedule_validation_group_error'));
      if (schedule != null && !DtekSchedule.isValid(schedule)) throw new Error(I18n.t('schedule_validation_single_error'));
      if (!Array.isArray(schedules) || schedules.length > 2 || schedules.some(item => !DtekSchedule.isValid(item))) {
        throw new Error(I18n.t('schedule_validation_collection_error'));
      }
      return locked(async () => {
        const state = await readState();
        const saved = state.addresses.find(item => item.id === address.id);
        if (!saved || !sameAddress(saved, address)) return;
        queue = ScheduleStorage.queueName(queue);
        saved.queue = queue;
        saved.queueVerified = !!queue;
        const a = ScheduleStorage.archive(state, saved.localityId, queue);
        const history = state.histories[saved.id] ||= {};
        // Restore the latest version after the website has confirmed this group.
        if (queue) for (const date of Object.keys(a.days)) {
          if (!history[date]) history[date] = { archiveId: a.id };
        }
        const incoming = new Map([...(schedule ? [schedule] : []), ...schedules].map(item => [item.date, item]));
        for (const item of incoming.values()) {
          const ref = ScheduleStorage.snapshot(a, item, queue);
          if (item.date >= DtekSchedule.dateKey() || !history[item.date]) history[item.date] = ref;
        }
        await writeState(state);
      });
    },
    async archives() {
      return locked(async () => {
        const state = await readState();
        return Object.values(state.archives).map(item => ({ ...item,
          locality: state.localities[item.localityId],
          addressCount: state.addresses.filter(address => Object.values(state.histories[address.id] || {}).some(ref => ref.archiveId === item.id) ||
            address.localityId === item.localityId && address.queueVerified && address.queue === item.queue).length
        })).sort((a, b) => a.locality.region.localeCompare(b.locality.region) || a.locality.name.localeCompare(b.locality.name, 'uk') || a.queue.localeCompare(b.queue));
      });
    },
    async removeArchive(id) {
      return locked(async () => {
        const state = await readState();
        const a = state.archives[id];
        if (!a) return;
        for (const address of state.addresses) {
          let affected = address.localityId === a.localityId && address.queue === a.queue;
          for (const [date, ref] of Object.entries(state.histories[address.id] || {})) {
            if (ref.archiveId === id) { delete state.histories[address.id][date]; affected = true; }
          }
          if (affected) { address.revision++; address.queue = ''; address.queueVerified = false; }
        }
        delete state.archives[id];
        await writeState(state);
      });
    },
    async forPage(value, id = null) {
      const region = DtekSites.forUrl(value);
      if (!region) return null;
      const addresses = await locked(list);
      return id !== null ? addresses.find(item => item.id === id && item.region === region.id) || null :
        addresses.find(item => item.region === region.id) || null;
    },
    async loadPreferences() {
      const { autoClosePopups, archiveRetentionDays } = await chrome.storage.local.get(['autoClosePopups', 'archiveRetentionDays']);
      return { autoClosePopups: autoClosePopups === true, archiveRetentionDays: retentionDays(archiveRetentionDays) };
    },
    async savePreferences(preferences) {
      if ('archiveRetentionDays' in preferences && !validRetention(preferences.archiveRetentionDays)) {
        throw new Error(I18n.t('settings_archive_retention_invalid'));
      }
      return locked(async () => {
        const updates = {};
        if ('autoClosePopups' in preferences) {
          updates.autoClosePopups = preferences.autoClosePopups === true;
          if (updates.autoClosePopups) updates.popupOfferPending = false;
        }
        if ('archiveRetentionDays' in preferences) {
          const state = await readState(false);
          if (prune(state, preferences.archiveRetentionDays)) updates.scheduleData = ScheduleStorage.validate(state);
          updates.archiveRetentionDays = preferences.archiveRetentionDays;
        }
        await chrome.storage.local.set(updates);
      });
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
