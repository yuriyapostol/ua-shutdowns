const { readFileSync } = require('node:fs');
const { readCatalogs } = require('../scripts/check-locales.cjs');

// Emulate Chrome's regional -> language -> default catalog resolution.
function i18nFixtureSource(uiLocale = 'uk', overrides = {}) {
  const catalogs = { ...readCatalogs(), ...overrides };
  const defaultLocale = JSON.parse(readFileSync(require.resolve('../manifest.json'), 'utf8')).default_locale;
  const locale = uiLocale.replaceAll('-', '_');
  const find = name => Object.keys(catalogs).find(key => key.toLowerCase() === name.toLowerCase());
  const catalog = { ...catalogs[defaultLocale], ...catalogs[find(locale.split('_')[0])], ...catalogs[find(locale)] };
  return `
    globalThis.chrome ??= {};
    chrome.i18n = {
      getUILanguage: () => ${JSON.stringify(uiLocale)},
      getMessage(key, substitutions = []) {
        const entry = ${JSON.stringify(catalog)}[key];
        if (!entry) return '';
        const values = typeof substitutions === 'string' ? [substitutions] : substitutions;
        const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {}).map(([name, value]) => [name.toLowerCase(), value]));
        return entry.message.replace(/\\$([a-z0-9_@]+)\\$|\\$([1-9])|\\$\\$/gi, (_, name, index) => {
          if (name) return (placeholders[name.toLowerCase()]?.content || '').replace(/\\$([1-9])/g, (_, position) => String(values[+position - 1] ?? ''));
          return index ? String(values[+index - 1] ?? '') : '$';
        });
      }
    };
    const I18nDefaultLocale = ${JSON.stringify(defaultLocale)};
    const I18nCatalogs = ${JSON.stringify(catalogs)};
    ${readFileSync(require.resolve('../i18n.js'), 'utf8')}
  `;
}
module.exports = { i18nFixtureSource };
