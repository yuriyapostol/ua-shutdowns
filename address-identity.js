'use strict';

// Conservative comparison for the edit confirmation. It never changes stored addresses
// or matches website suggestions. Unknown types/spelling changes require a decision.
const AddressIdentity = (() => {
  const normalize = value => value.normalize('NFC').toLocaleLowerCase('uk')
    .replace(/[’'`ʼ]/g, "'").trim().replace(/\s+/g, ' ');
  const streetTypes = {
    street: ['вулиця', 'вул.', 'вул'], lane: ['провулок', 'пров.', 'пров', 'пров-к'],
    avenue: ['проспект', 'просп.', 'просп', 'пр-т'], boulevard: ['бульвар', 'бульв.', 'бульв', 'бул.', 'бул', 'б-р'],
    square: ['площа', 'пл.', 'пл'], maidan: ['майдан', 'майд.', 'майд'], descent: ['узвіз', 'узв.', 'узв'],
    slope: ['спуск'], embankment: ['набережна', 'наб.', 'наб'], highway: ['шосе', 'ш.', 'ш'],
    passage: ['проїзд', 'пр-д'], road: ['дорога'], alley: ['алея'], deadEnd: ['тупик', 'туп.', 'туп'],
    entrance: ["в'їзд"], approach: ['заїзд'], quarter: ['квартал', 'кварт.', 'кв-л'],
    neighborhood: ['мікрорайон', 'мкр.', 'мкр', 'мкр-н'], estate: ['житловий масив', 'масив'],
    tract: ['урочище'], route: ['тракт'], line: ['лінія', 'лін.'], clearing: ['просіка'],
    rise: ['підйом'], crossing: ['переїзд'], ring: ['кільце']
  };
  const settlementTypes = {
    city: ['місто', 'м.', 'м'], village: ['село', 'с.', 'с'], settlement: ['селище', 'с-ще'],
    urbanSettlement: ['селище міського типу', 'смт.', 'смт'],
    hamlet: ['хутір', 'хут.', 'х.'], smallTown: ['містечко', 'м-ко'], stanitsa: ['станиця', 'ст-ця']
  };
  const aliases = types => Object.entries(types).flatMap(([type, names]) => names.map(name => ({ type, name })))
    .sort((a, b) => b.name.length - a.name.length);
  const streetAliases = aliases(streetTypes);
  const settlementAliases = aliases(settlementTypes);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function parse(value, types) {
    value = normalize(value);
    for (const { type, name } of types) {
      // A dotted abbreviation may directly precede its name: вул.Миру.
      const prefix = new RegExp('^' + escape(name) + (name.endsWith('.') ? '[\\s,]*' : '[\\s,]+'), 'u');
      const suffix = new RegExp('[\\s,]+' + escape(name) + '$', 'u');
      if (prefix.test(value)) return { type, name: value.replace(prefix, '').trim() };
      if (suffix.test(value)) return { type, name: value.replace(suffix, '').trim() };
    }
    return { type: null, name: value };
  }
  function sameName(before, after, types) {
    const left = parse(before, types), right = parse(after, types);
    return left.name === right.name && (!left.type || !right.type || left.type === right.type);
  }
  function requiresConfirmation(before, after) {
    // Spaces and letter case are formatting. Every other building character counts:
    // 17А / 17Б, 17/1 / 171 and 17-1 / 17/1 must never be treated as equivalent.
    const house = value => value.normalize('NFC').toLocaleLowerCase('uk').replace(/\s+/g, '');
    return before.region !== after.region || house(before.house) !== house(after.house) ||
      !sameName(before.city, after.city, settlementAliases) || !sameName(before.street, after.street, streetAliases);
  }
  return Object.freeze({ requiresConfirmation });
})();
