// New-schema fixtures, independent of the temporary converter.
const { randomUUID } = require('node:crypto');
function fixtureState(profiles = []) {
  const state = { schemaVersion: 1, addresses: [], localities: {}, archives: {}, histories: {} };
  for (const source of profiles) {
    let place = Object.values(state.localities).find(item => item.region === source.region && item.name === source.city);
    if (!place) { place = { id: randomUUID(), region: source.region, name: source.city, aliases: [] }; state.localities[place.id] = place; }
    const { schedules, schedule, ...fields } = source;
    const address = { ...fields, revision: source.revision || 1, localityId: place.id, queue: source.queue || '', queueVerified: !!source.queue };
    state.addresses.push(address);
    const history = state.histories[address.id] = {};
    for (const day of [...Object.values(schedules || {}), ...(schedule ? [schedule] : [])]) {
      const queue = day.queue ?? source.queue ?? '';
      let archive = Object.values(state.archives).find(item => item.localityId === place.id && item.queue === queue);
      if (!archive) { archive = { id: randomUUID(), localityId: place.id, queue, days: {} }; state.archives[archive.id] = archive; }
      const snapshot = { ...structuredClone(day), queue, id: randomUUID(), observedAt: null };
      (archive.days[day.date] ||= []).push(snapshot);
      history[day.date] = { archiveId: archive.id, snapshotId: snapshot.id };
    }
  }
  return state;
}
module.exports = { fixtureState };
