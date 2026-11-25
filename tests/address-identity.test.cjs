const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const api = vm.runInNewContext(readFileSync(require.resolve('../address-identity.js'), 'utf8') + '\nAddressIdentity;');
const address = { region: 'krem', city: 'Обухів', street: 'Миру', house: '17 А' };
const asks = (before, after) => api.requiresConfirmation({ ...address, ...before }, { ...address, ...after });

test('type addition/removal and full/short names are formatting in both directions', () => {
  for (const [field, name, variants] of [
    ['street', 'Миру', ['вул. Миру', 'вул.Миру', 'вул Миру', 'вулиця Миру', 'Миру, вул.', 'Миру вулиця']],
    ['street', 'Миру', ['пров. Миру', 'пров Миру', 'провулок Миру', 'Миру, пров.']],
    ['street', 'Миру', ['проспект Миру', 'просп. Миру', 'пр-т Миру']],
    ['street', 'Миру', ['бульвар Миру', 'бул. Миру', 'б-р Миру']],
    ['street', 'Миру', ['площа Миру', 'пл. Миру']],
    ['street', 'Миру', ['набережна Миру', 'наб. Миру']],
    ['street', 'Миру', ['узвіз Миру', 'узв. Миру']],
    ['street', 'Миру', ['проїзд Миру', 'пр-д Миру']],
    ['street', 'Миру', ['шосе Миру', 'ш. Миру']],
    ['street', 'Миру', ['алея Миру', 'тупик Миру', 'дорога Миру', 'майдан Миру']],
    ['city', 'Обухів', ['м. Обухів', 'м.Обухів', 'м Обухів', 'місто Обухів', 'Обухів, м.']],
    ['city', 'Калинівка', ['с. Калинівка', 'село Калинівка', 'Калинівка, с.']],
    ['city', 'Калинівка', ['селище Калинівка', 'с-ще Калинівка']],
    ['city', 'Калинівка', ['смт Калинівка', 'смт. Калинівка', 'селище міського типу Калинівка']]
  ]) {
    for (const variant of variants) {
      assert.equal(asks({ [field]: name }, { [field]: variant }), false, `${name} -> ${variant}`);
      assert.equal(asks({ [field]: variant }, { [field]: name }), false, `${variant} -> ${name}`);
    }
    // Only aliases within each type are compared below; the mixed uncommon types
    // above deliberately test addition/removal, never equality of different types.
    if (variants.length > 1 && !(field === 'street' && variants[0] === 'алея Миру')) {
      for (const variant of variants) assert.equal(asks({ [field]: variants[0] }, { [field]: variant }), false);
    }
  }
});
test('changing an explicit geographic type always requires a decision', () => {
  for (const [field, before, after] of [
    ['street', 'вул. Миру', 'пров. Миру'], ['street', 'просп. Миру', 'проїзд Миру'],
    ['street', 'пл. Миру', 'майдан Миру'], ['street', 'алея Миру', 'тупик Миру'],
    ['city', 'м. Калинівка', 'с. Калинівка'], ['city', 'село Калинівка', 'селище Калинівка'],
    ['city', 'смт Калинівка', 'селище Калинівка'], ['city', 'х. Калинівка', 'с. Калинівка']
  ]) assert.equal(asks({ [field]: before }, { [field]: after }), true, `${before} -> ${after}`);
});
test('every building letter, digit and separator is significant; only spaces/case are ignored', () => {
  for (const [before, after] of [['17А', '17Б'], ['17А', '17'], ['17', '17А'], ['17/1', '171'], ['17-1', '17/1'], ['17.1', '171'], ['17А', '17A'], ['17', '18']]) {
    assert.equal(asks({ house: before }, { house: after }), true, `${before} -> ${after}`);
  }
  assert.equal(asks({ house: ' 17 А ' }, { house: '17а' }), false);
});
test('name edits, unknown types and region changes are never guessed', () => {
  for (const changed of [{ city: 'Обухівв' }, { street: 'Мирру' }, { street: 'пр. Миру' }, { region: 'oem' }]) {
    assert.equal(asks({}, changed), true);
  }
  assert.equal(asks({}, { city: ' ОБУХІВ ', street: ' МИРУ ' }), false);
  assert.equal(asks({ street: "Мар'янівська" }, { street: 'Мар’янівська' }), false);
  assert.equal(asks({ street: 'Героїв проспекту' }, { street: 'Героїв' }), true);
});
