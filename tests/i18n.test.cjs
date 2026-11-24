const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const read = file => readFileSync(require.resolve('../' + file), 'utf8');
const { readCatalogs, checkLocales } = require('../scripts/check-locales.cjs');
const catalogs = readCatalogs();
function setup(locale, extra = '') {
  return vm.runInNewContext(i18nFixtureSource(locale) + '\n' + read('dtek-schedule.js') + '\n' + extra +
    '\n({ i18n: I18n, schedule: DtekSchedule });', { Intl, Date });
}

test('all discovered catalogs cover source keys and provide translator context and valid placeholders', () => {
  const result = checkLocales();
  assert.deepEqual(result.languages, Object.keys(catalogs).sort());
  assert.equal(result.messages, Object.keys(catalogs.en).length);
});

test('automatically selects Ukrainian, regional English or English fallback', () => {
  for (const [browser, language, locale] of [['uk', 'uk', 'uk-UA'], ['uk-UA', 'uk', 'uk-UA'],
    ['en-US', 'en', 'en-US'], ['en-GB', 'en', 'en-GB'], ['zz-ZZ', 'en', 'en-US']]) {
    const { i18n } = setup(browser);
    assert.equal(i18n.language, language);
    assert.equal(i18n.locale, locale);
    assert.equal(i18n.t('home_screen_title'), catalogs[language].home_screen_title.message);
  }
});

test('date input formats and parses day/month order for each locale', () => {
  for (const [locale, display, hint, firstDay] of [['uk', '23.11.2026', 'ДД.ММ.РРРР', 1],
    ['en-US', '11/23/2026', 'MM/DD/YYYY', 0], ['en-GB', '23/11/2026', 'DD/MM/YYYY', 1]]) {
    const { i18n, schedule } = setup(locale);
    assert.equal(i18n.formatDate('2026-11-23'), display);
    assert.equal(i18n.parseDate(display), '2026-11-23');
    assert.equal(i18n.datePlaceholder, hint);
    assert.equal(i18n.firstWeekday, firstDay);
    for (const date of ['0001-01-01', '2024-02-29', '9999-12-31']) {
      assert.equal(i18n.parseDate(i18n.formatDate(date)), date);
    }
    assert.equal(i18n.parseDate('2026-11-23'), null);
    assert.equal(i18n.parseDate('invalid'), null);
    assert.equal(schedule.validDate(i18n.parseDate(locale === 'en-US' ? '02/30/2024' : locale === 'uk' ? '30.02.2024' : '30/02/2024')), false);
    assert.equal(schedule.validDate(i18n.parseDate(locale === 'en-US' ? '02/29/2024' : locale === 'uk' ? '29.02.2024' : '29/02/2024')), true);
  }
});

test('English sharing translates headings and lines without altering saved address data', () => {
  const { schedule } = setup('en-US');
  const address = { city: 'Обухів', street: 'Миру', house: '17', queue: '4.1' };
  const day = { date: '2026-11-23', queue: '5.2', lines: [[], [[1410, 1440]]] };
  const before = JSON.stringify({ address, day });
  assert.equal(schedule.toText(address, { id: 'krem', name: 'Київська область' }, day),
    'Power outages on Monday, November 23, 2026 (Kyiv region, Обухів, group 5.2):\nLine 1:\nNo outages\nLine 2:\n23:30 – 24:00');
  assert.equal(JSON.stringify({ address, day }), before);
  assert.throws(() => schedule.toText(address, null, day), /not been received/);
});

test('storage validation errors use the selected language', async () => {
  const context = vm.createContext({ URL });
  vm.runInContext(i18nFixtureSource('en-US') + '\n' + read('dtek-sites.js') + '\n' +
    read('dtek-schedule.js') + '\n' + read('address-settings.js') + '\nglobalThis.settings = AddressSettings;', context);
  await assert.rejects(context.settings.upsert({ region: 'unknown' }), /Select a regional operator/);
  await assert.rejects(context.settings.upsert({ region: 'krem', city: '' }), /Enter the city/);
});

test('adding a third language needs only catalog metadata, not JavaScript changes', () => {
  const french = structuredClone(catalogs.en);
  french.locale_language.message = 'fr';
  french.locale_format.message = 'fr-FR';
  french.locale_week_first_day.message = '1';
  french.home_screen_title.message = 'Horaires des coupures';
  for (const [browser, expectedLocale] of [['fr', 'fr-FR'], ['fr-CA', 'fr-CA']]) {
    const api = vm.runInNewContext(i18nFixtureSource(browser, { fr: french }) + '\nI18n;', { Intl, Date });
    assert.equal(api.language, 'fr');
    assert.equal(api.locale, expectedLocale);
    assert.equal(api.t('home_screen_title'), 'Horaires des coupures');
    assert.equal(api.parseDate(api.formatDate('2024-02-29')), '2024-02-29');
    assert.match(api.sharedDate('2026-11-23'), /novembre/);
  }
});

test('date entry supports a new language with year-first dates and several literal separators', () => {
  const korean = structuredClone(catalogs.en);
  korean.locale_language.message = 'ko';
  korean.locale_format.message = 'ko-KR';
  const api = vm.runInNewContext(i18nFixtureSource('ko-KR', { ko: korean }) + '\nI18n;', { Intl, Date });
  assert.equal(api.formatDate('2026-11-23'), '2026. 11. 23.');
  assert.equal(api.parseDate('2026. 11. 23.'), '2026-11-23');
  assert.equal(api.parseDate('23.11.2026'), null);
});

test('named placeholders can be reordered and user values are inserted literally', () => {
  const { i18n } = setup('en-US');
  assert.equal(i18n.t('schedule_share_address_accessible_label', ['11/23/2026', 'Street $1, $DATE$']),
    'Share schedule for 11/23/2026: Street $1, $DATE$');
});

test('validation discovers added locales and rejects missing context or broken placeholders', () => {
  const { mkdtempSync, cpSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join, resolve } = require('node:path');
  const root = mkdtempSync(join(tmpdir(), 'ua-shutdowns-locales-'));
  try {
    for (const filename of ['manifest.json', 'i18n.js', 'popup.html', 'popup.js', 'address-settings.js',
      'address-navigation.js', 'background.js', 'dtek-content-script.js', 'dtek-schedule.js', 'dtek-sites.js', '_locales']) {
      cpSync(resolve(__dirname, '..', filename), join(root, filename), { recursive: true });
    }
    const french = structuredClone(catalogs.en);
    french.locale_language.message = 'fr';
    french.locale_format.message = 'fr-FR';
    mkdirSync(join(root, '_locales/fr'), { recursive: true });
    const save = () => writeFileSync(join(root, '_locales/fr/messages.json'), JSON.stringify(french));
    save();
    assert.ok(checkLocales(root).languages.includes('fr'));
    delete french.schedule_share_copy_error.description;
    save();
    assert.throws(() => checkLocales(root), /missing translator description/);
    french.schedule_share_copy_error.description = 'Clipboard copy failure on the sharing screen.';
    french.schedule_share_address_accessible_label.message = 'Schedule $MISSING$';
    save();
    assert.throws(() => checkLocales(root), /undefined placeholder MISSING/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('every catalog has working date input and sharing text without unresolved placeholders', () => {
  for (const [directory, catalog] of Object.entries(catalogs)) {
    const { i18n } = setup(directory.replaceAll('_', '-'));
    assert.equal(i18n.language, catalog.locale_language.message);
    for (const date of ['0001-01-01', '2024-02-29', '2026-11-23', '9999-12-31']) {
      assert.equal(i18n.parseDate(i18n.formatDate(date)), date, directory);
    }
    assert.doesNotMatch(i18n.sharedDate('2026-11-23'), /\$[A-Z_]+\$/, directory);
  }
});


test('European catalogs select regional variants and localize dates and sharing', () => {
  const cases = [
    ['de', 'de-AT', '23.11.2026', 'TT.MM.JJJJ', 'Stromabschaltungen'],
    ['fr', 'fr-BE', '23/11/2026', 'JJ/MM/AAAA', 'Coupures de courant'],
    ['es', 'es-MX', '23/11/2026', 'DD/MM/AAAA', 'Cortes de luz'],
    ['it', 'it-CH', '23/11/2026', 'GG/MM/AAAA', 'Interruzioni di corrente'],
    ['pl', 'pl-PL', '23.11.2026', 'DD.MM.RRRR', 'Wyłączenia prądu']
  ];
  for (const [language, regional, date, hint, heading] of cases) {
    const { i18n, schedule } = setup(language);
    assert.equal(i18n.language, language);
    assert.equal(i18n.formatDate('2026-11-23'), date);
    assert.equal(i18n.datePlaceholder, hint);
    assert.equal(i18n.firstWeekday, 1);
    const variant = setup(regional).i18n;
    assert.equal(variant.language, language);
    assert.equal(variant.locale, regional);
    assert.equal(variant.parseDate(variant.formatDate('2024-02-29')), '2024-02-29');
    const address = { city: 'Обухів', street: 'Миру', house: '17', queue: '5.2' };
    const day = { date: '2026-11-23', queue: '5.2', lines: [[], [[1410, 1440]]] };
    const before = JSON.stringify({ address, day });
    const text = schedule.toText(address, { id: 'krem' }, day);
    assert.ok(text.startsWith(heading), language);
    assert.ok(text.includes('Обухів'), language);
    assert.ok(text.includes(catalogs[language].schedule_no_outages.message), language);
    assert.ok(text.includes(i18n.t('schedule_supply_line_label', ['2'])), language);
    assert.ok(text.includes('23:30 – 24:00'), language);
    assert.doesNotMatch(text, /\$[A-Z_]+\$/);
    assert.equal(JSON.stringify({ address, day }), before);
  }
});

test('regional browser settings control date order and the calendar week', () => {
  for (const [locale, display, firstDay, monday] of [
    ['de-DE', '23.11.2026', 1, 'Montag'],
    ['fr-FR', '23/11/2026', 1, 'lundi'],
    ['es-ES', '23/11/2026', 1, 'lunes'],
    ['it-IT', '23/11/2026', 1, 'lunedì'],
    ['pl-PL', '23.11.2026', 1, 'poniedziałek'],
    ['uk-UA', '23.11.2026', 1, 'понеділок'],
    ['en-US', '11/23/2026', 0, 'Monday'],
    ['en-GB', '23/11/2026', 1, 'Monday'],
    ['fr-CA', '2026-11-23', 0, 'lundi'],
    ['es-MX', '23/11/2026', 0, 'lunes']
  ]) {
    const { i18n } = setup(locale);
    assert.equal(i18n.locale, locale);
    assert.equal(i18n.formatDate('2026-11-23'), display, locale);
    assert.equal(i18n.parseDate(display), '2026-11-23', locale);
    assert.equal(i18n.firstWeekday, firstDay, locale);
    assert.ok(i18n.sharedDate('2026-11-23').includes(monday), locale);
  }
});

test('catalog examples use Ukrainian addresses and their own date and weekday formats', () => {
  for (const [language, catalog] of Object.entries(catalogs)) {
    const { i18n } = setup(language);
    for (const [key, entry] of Object.entries(catalog)) {
      for (const [name, value] of Object.entries(entry.placeholders || {})) {
        const context = `${language}/${key}/${name}`;
        if (name === 'address' || name === 'place') assert.equal(value.example, 'Київ, Хрещатик 22', context);
        if (name === 'date_format') assert.equal(value.example, i18n.datePlaceholder, context);
        if (name === 'date') assert.equal(value.example, key === 'schedule_share_text_header' ?
          i18n.sharedDate('2026-11-23') : i18n.formatDate('2026-11-23'), context);
        if (name === 'weekday') assert.equal(value.example, catalog.schedule_share_weekday_1.message, context);
      }
    }
  }
});
