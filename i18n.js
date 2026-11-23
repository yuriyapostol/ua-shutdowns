'use strict';

const I18n = (() => {
  function t(key, substitutions = []) {
    return chrome.i18n.getMessage(key, substitutions);
  }
  // Chrome resolves catalogs and missing messages using manifest.default_locale.
  // Locale metadata lives in each catalog, so adding a language needs no JS changes.
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
  return { t, language, locale, firstWeekday, direction, datePlaceholder, formatDate, parseDate, sharedDate, localizeDocument };
})();
