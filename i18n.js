'use strict';

const I18n = (() => {
  let catalog = null;
  const languages = Object.entries(I18nCatalogs).map(([value, messages]) => ({
    value, label: messages.locale_native_name.message
  }));
  const api = { t, languages, preference: 'system', init, setLanguage };

  function t(key, substitutions = []) {
    if (!catalog) return chrome.i18n.getMessage(key, substitutions);
    const entry = catalog[key] || I18nCatalogs[I18nDefaultLocale][key];
    if (!entry) return '';
    const values = typeof substitutions === 'string' ? [substitutions] : substitutions;
    const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {})
      .map(([name, value]) => [name.toLowerCase(), value.content]));
    // Replace in one pass so dollar signs in user data remain literal.
    return entry.message.replace(/\$([a-z0-9_@]+)\$|\$([1-9])|\$\$/gi, (_, name, index) => {
      if (name) return (placeholders[name.toLowerCase()] || '').replace(/\$([1-9])/g,
        (_, position) => String(values[+position - 1] ?? ''));
      return index ? String(values[+index - 1] ?? '') : '$';
    });
  }
  function applyLanguage(preference) {
    api.preference = Object.hasOwn(I18nCatalogs, preference) ? preference : 'system';
    catalog = api.preference === 'system' ? null : I18nCatalogs[api.preference];
    configure();
  }
  async function init() {
    const { interfaceLanguage } = await chrome.storage.local.get('interfaceLanguage');
    applyLanguage(interfaceLanguage);
  }
  async function setLanguage(preference) {
    if (preference !== 'system' && !Object.hasOwn(I18nCatalogs, preference)) {
      throw new Error('Unsupported interface language');
    }
    await chrome.storage.local.set({ interfaceLanguage: preference });
    applyLanguage(preference);
  }

  function configure() {
    // System mode uses Chrome's catalog resolution; explicit choices use bundled catalogs.
    const language = t('locale_language');
    const defaultLocale = t('locale_format');
    const uiLocale = chrome.i18n.getUILanguage().replaceAll('_', '-');
    const browserLocale = new Intl.Locale(uiLocale);
    const locale = browserLocale.language === new Intl.Locale(language).language &&
      (browserLocale.region || browserLocale.script) ? uiLocale : defaultLocale;
    // Stored dates use Gregorian years and ASCII digits regardless of display locale.
    const dateOptions = { timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn' };
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      ...dateOptions, day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const dateParts = dateFormatter.formatToParts(new Date('2006-11-23T12:00:00Z'));
    const dateOrder = dateParts.filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => part.type);
    const dateTokens = { day: t('locale_date_day_token'), month: t('locale_date_month_token'), year: t('locale_date_year_token') };
    const datePlaceholder = dateParts.map(part => dateTokens[part.type] || part.value).join('');
    const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const datePattern = new RegExp('^' + dateParts.map(part => dateOrder.includes(part.type) ?
      (part.type === 'year' ? '(\\d{4})' : '(\\d{1,2})') : escapePattern(part.value)).join('') + '$');
    const intlLocale = new Intl.Locale(locale);
    const weekInfo = intlLocale.getWeekInfo?.() || intlLocale.weekInfo;
    const firstWeekday = weekInfo ? weekInfo.firstDay % 7 : Number(t('locale_week_first_day'));
    const direction = (intlLocale.getTextInfo?.() || intlLocale.textInfo)?.direction || 'ltr';

    function formatDate(key) {
      const [year, month, day] = key.split('-');
      const values = { year, month, day };
      return dateParts.map(part => values[part.type] || part.value).join('');
    }
    function parseDate(value) {
      const match = value.trim().match(datePattern);
      if (!match) return null;
      const values = Object.fromEntries(dateOrder.map((type, index) =>
        [type, match[index + 1].padStart(type === 'year' ? 4 : 2, '0')]));
      return `${values.year}-${values.month}-${values.day}`;
    }
    function sharedDate(date) {
      const day = new Date(date + 'T12:00:00Z');
      const formatter = new Intl.DateTimeFormat(locale, { ...dateOptions, day: 'numeric', month: 'long', year: 'numeric' });
      const parts = formatter.formatToParts(day);
      const part = name => parts.find(item => item.type === name).value;
      const fullDate = new Intl.DateTimeFormat(locale, { ...dateOptions, dateStyle: 'full' }).format(day);
      return t('schedule_share_date_text', [fullDate, t('schedule_share_weekday_' + day.getUTCDay()),
        part('day'), part('month'), part('year')]);
    }
    function localizeDocument(root = document) {
      root.documentElement.lang = language;
      root.documentElement.dir = direction;
      for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
          element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
        }
      }
      const input = root.getElementById('schedule-date');
      input.placeholder = datePlaceholder;
      input.setAttribute('aria-label', `${t('date_input_accessible_label')}, ${datePlaceholder}`);
    }
    Object.assign(api, { language, locale, firstWeekday, direction, datePlaceholder, formatDate, parseDate, sharedDate, localizeDocument });
  }
  configure();
  return api;
})();
