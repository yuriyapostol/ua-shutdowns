# Translating UA Shutdowns

**English** · [Українська](TRANSLATING.uk.md)

Interface and Chrome Web Store translations can grow independently of the documentation. Documentation and GitHub release notes are maintained in English and Ukrainian only.

## Add an interface language

1. Copy `_locales/en/messages.json` to `_locales/<locale>/messages.json`. Use a [Chrome-supported locale directory](https://developer.chrome.com/docs/extensions/reference/api/i18n), such as `pl` or `pt_BR`.
2. Translate `message` values. Keep keys and placeholder names unchanged. Each entry's `description` explains where and how the text is used. Every `description` must be written in the catalog’s language, including metadata and accessibility notes. Keep date and weekday examples consistent with `locale_format`. Always keep address examples in Ukrainian and use `Київ, Хрещатик, 22` for a full address. For individual components, use city `Київ`, street `Хрещатик`, and building number `22`; a place-only example uses `Київ`.
3. Set the locale metadata described below. No JavaScript or language registration list needs updating.
4. Run `node scripts/check-locales.cjs` and `node --test tests/*.test.cjs`.
5. Reload the unpacked extension and check it in Chrome with the target interface language, including date entry, calendar navigation, long labels and sharing text.

Chrome chooses the catalog using its interface language and falls back to `manifest.json`'s `default_locale`, currently English, for missing messages. Our checks require complete catalogs before publication so users do not see an accidentally mixed interface.

### Keys and translator context

Use descriptive `snake_case` keys grouped by feature and purpose, for example `schedule_share_copy_error`, `address_form_city_placeholder` or `date_calendar_next_month_action`. Dots and nested message groups are not supported by Chrome's native catalog format. Keep keys stable when rewording a message.

The catalog is standard [Chrome messages.json](https://developer.chrome.com/docs/extensions/how-to/ui/localization-message-formats):

```json
{
  "schedule_share_address_accessible_label": {
    "message": "Share schedule for $DATE$: $ADDRESS$",
    "description": "Accessible label for sharing a particular address's schedule on a selected date.",
    "placeholders": {
      "date": { "content": "$1", "example": "11/23/2026" },
      "address": { "content": "$2", "example": "Київ, Хрещатик, 22" }
    }
  }
}
```

- `message`: translated text shown to the user.
- `description`: context for translators, not displayed in the interface.
- `placeholders`: named dynamic values. Preserve their `content` (`$1`, `$2`, etc.); examples show what values look like. You may reorder named placeholders in the translated sentence. Keep every placeholder definition, even when a language's message does not use all of them.

Do not translate stored address values. The DTEK website expects Ukrainian place and street names. “Group” means the DTEK outage queue identifier (for example, 5.2), not a waiting line. “Line” means a building's electricity supply line.

### Locale metadata and dates

These entries configure the locale instead of displaying a sentence:

| Key | Example | Meaning |
| --- | --- | --- |
| `locale_language` | `pt-BR` | BCP 47 tag matching the catalog directory (`pt_BR`) |
| `locale_format` | `pt-BR` | Default date/calendar locale for this translation |
| `locale_week_first_day` | `1` | Fallback first weekday: Sunday = 0, Monday = 1, through Saturday = 6 |
| `locale_date_day_token` | `DD` | Day abbreviation in the date format hint |
| `locale_date_month_token` | `MM` | Month abbreviation in the date format hint |
| `locale_date_year_token` | `YYYY` | Four-digit year abbreviation in the date format hint |

If Chrome's interface language matches the selected catalog language, its regional variant controls date order and the calendar. Otherwise `locale_format` is used. Date entry uses Gregorian dates and ASCII digits; dates in storage always use `YYYY-MM-DD`, and outage days are determined in the Kyiv timezone.

`schedule_share_date_text` normally uses `$FULL_DATE$`, formatted automatically for the locale. If the language needs a custom grammatical date, use `$WEEKDAY$`, `$DAY$`, `$MONTH$` and `$YEAR$`. In that case translate `schedule_share_weekday_0` through `_6` for the sentence, starting with Sunday. Ukrainian uses these to preserve phrases such as “у вівторок”. Month names are supplied by `Intl` in a full date context.

`dtek_region_<id>_name` and `dtek_operator_<id>_name` are display names. `dtek_region_<id>_short` is the region name used in shared text.

## Add a Chrome Web Store language

1. Add the corresponding interface catalog first so Chrome Web Store can offer that locale.
2. Copy `store/en/description.txt` to `store/<locale>/description.txt` and translate it. Keep it plain text so it can be pasted into the store without Markdown conversion. Keep the DTEK coverage and privacy explanation accurate.
3. The localized name and short summary come from `extension_name` and `extension_description` in the interface catalog, referenced by the manifest. Chrome limits them to 75 and 132 characters respectively.
4. After uploading the localized extension ZIP, select the language on the Developer Dashboard's Store listing tab and paste the detailed description. Add localized screenshots there if available. Repository files are not uploaded to the listing automatically.

See [Google's listing localization guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing). Store translations are optional for a newly added interface language; the validator checks any store languages that are present. Link new store translations to one of the two maintained documentation languages; do not promise documentation in a language that does not exist.

## Documentation and releases

- English: `README.md`, `CHANGELOG.md`, `TRANSLATING.md`.
- Ukrainian: `README.uk.md`, `CHANGELOG.uk.md`, `TRANSLATING.uk.md`.
- Add each release version to both changelogs. GitHub Actions builds a single bilingual GitHub release description: Ukrainian first, English second. It stops if either version's entry is missing or empty.
- Additional interface languages do not require additional README files, changelogs or GitHub release translations.

Run `python3 tests/release-notes.test.py` to check the release notes builder.
