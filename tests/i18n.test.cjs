const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { i18nFixtureSource } = require('./i18n-fixture.cjs');
const read = file => readFileSync(require.resolve('../' + file), 'utf8');
const { readCatalogs, checkLocales, catalogBundle } = require('../scripts/check-locales.cjs');
const catalogs = readCatalogs();
function setup(locale, extra = '') {
  return vm.runInNewContext(i18nFixtureSource(locale) + '\n' + read('dtek-schedule.js') + '\n' + extra +
    '\n({ i18n: I18n, schedule: DtekSchedule });', { Intl, Date });
}

test('all discovered catalogs cover source keys and provide translator context and valid placeholders', () => {
  assert.equal(read('i18n-catalogs.js'), catalogBundle(), 'Regenerate bundled catalogs with --write');
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
    read('dtek-schedule.js') + '\n' + read('address-identity.js') + '\n' + read('address-settings.js') + '\nglobalThis.settings = AddressSettings;', context);
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

function storedLanguage(browser, initial = {}) {
  const data = structuredClone(initial);
  let failSave = false;
  const chrome = { storage: { local: {
    async get() { return structuredClone(data); },
    async set(update) {
      if (failSave) throw new Error('Storage unavailable');
      Object.assign(data, structuredClone(update));
    }
  } } };
  const i18n = vm.runInNewContext(i18nFixtureSource(browser) + '\nI18n;', { chrome, Intl, Date });
  return { i18n, data, failSave() { failSave = true; } };
}

test('manual language persists and updates formatting, sharing and literal placeholders', async () => {
  const { i18n, data } = storedLanguage('uk');
  await i18n.init();
  assert.equal(i18n.preference, 'system');
  await i18n.setLanguage('en');
  assert.equal(data.interfaceLanguage, 'en');
  assert.equal(i18n.language, 'en');
  assert.equal(i18n.locale, 'en-US');
  assert.equal(i18n.formatDate('2026-11-23'), '11/23/2026');
  assert.match(i18n.sharedDate('2026-11-23'), /Monday, November 23, 2026/);
  assert.equal(i18n.t('schedule_share_address_accessible_label', ['11/23/2026', 'Street $1, $DATE$']),
    'Share schedule for 11/23/2026: Street $1, $DATE$');
  const reopened = storedLanguage('uk', data).i18n;
  await reopened.init();
  assert.equal(reopened.language, 'en');
  await reopened.setLanguage('system');
  assert.equal(reopened.language, 'uk');
  assert.equal(reopened.formatDate('2026-11-23'), '23.11.2026');
});

test('manual selections preserve matching browser regions and override a different language', async () => {
  for (const [browser, selection, expected] of [['en-GB', 'en', 'en-GB'], ['en-US', 'uk', 'uk-UA'],
    ['zz-ZZ', 'uk', 'uk-UA'], ['zz-ZZ', 'system', 'en-US']]) {
    const { i18n } = storedLanguage(browser, { interfaceLanguage: selection });
    await i18n.init();
    assert.equal(i18n.locale, expected);
  }
});

test('unsupported saved languages fall back to browser selection and failed saves keep current language', async () => {
  for (const value of ['unknown', '__proto__', null, 42]) {
    const { i18n } = storedLanguage('uk', { interfaceLanguage: value });
    await i18n.init();
    assert.equal(i18n.preference, 'system');
    assert.equal(i18n.language, 'uk');
  }
  const p = storedLanguage('uk', { interfaceLanguage: 'uk' });
  await p.i18n.init();
  await assert.rejects(p.i18n.setLanguage('unknown'), /Unsupported/);
  p.failSave();
  await assert.rejects(p.i18n.setLanguage('en'), /Storage unavailable/);
  assert.equal(p.i18n.language, 'uk');
  assert.equal(p.i18n.preference, 'uk');
  assert.equal(p.data.interfaceLanguage, 'uk');
});


test('European catalogs use regional dates, Mondays and localized sharing', async () => {
  for (const [language, locale, date, hint, weekday] of [
    ['de', 'de-DE', '23.11.2026', 'TT.MM.JJJJ', 'Montag'],
    ['fr', 'fr-FR', '23/11/2026', 'JJ/MM/AAAA', 'lundi'],
    ['es', 'es-ES', '23/11/2026', 'DD/MM/AAAA', 'lunes'],
    ['it', 'it-IT', '23/11/2026', 'GG/MM/AAAA', 'lunedì'],
    ['pl', 'pl-PL', '23.11.2026', 'DD.MM.RRRR', 'poniedziałek']
  ]) {
    const automatic = setup(language).i18n;
    assert.equal(automatic.language, language);
    assert.equal(automatic.locale, locale);
    assert.equal(automatic.firstWeekday, 1);
    assert.equal(automatic.formatDate('2026-11-23'), date);
    assert.equal(automatic.datePlaceholder, hint);
    assert.ok(automatic.sharedDate('2026-11-23').includes(weekday));
    const { i18n, data } = storedLanguage('uk');
    await i18n.setLanguage(language);
    assert.equal(data.interfaceLanguage, language);
    assert.equal(i18n.locale, locale);
    assert.equal(i18n.parseDate(date), '2026-11-23');
  }
});

test('matching browser regions override European catalog defaults', async () => {
  for (const [language, browser] of [['de', 'de-CH'], ['fr', 'fr-CA'], ['es', 'es-MX'], ['it', 'it-CH'], ['pl', 'pl-PL']]) {
    const { i18n } = storedLanguage(browser);
    await i18n.setLanguage(language);
    assert.equal(i18n.locale, browser);
    const expected = new Intl.DateTimeFormat(browser, {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn'
    }).format(new Date('2026-11-23T12:00:00Z'));
    assert.equal(i18n.formatDate('2026-11-23'), expected);
    assert.equal(i18n.parseDate(expected), '2026-11-23');
    const regional = new Intl.Locale(browser);
    const week = regional.getWeekInfo?.() || regional.weekInfo;
    assert.equal(i18n.firstWeekday, week.firstDay % 7);
  }
});
