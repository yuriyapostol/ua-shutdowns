# Chrome Web Store materials

**English** · [Українська](README.uk.md)

Detailed listing descriptions cover every interface language shipped in version 0.7.1. They are plain text for pasting into the Developer Dashboard; repository changes do not update the store automatically.

| Locale | Language | Detailed description |
| --- | --- | --- |
| de | Deutsch | [de/description.txt](de/description.txt) |
| en | English | [en/description.txt](en/description.txt) |
| es | Español | [es/description.txt](es/description.txt) |
| fr | Français | [fr/description.txt](fr/description.txt) |
| it | Italiano | [it/description.txt](it/description.txt) |
| pl | Polski | [pl/description.txt](pl/description.txt) |
| uk | Українська | [uk/description.txt](uk/description.txt) |

## Fields and assets

| Store field | Source |
| --- | --- |
| Name | `extension_name.message` in `_locales/<locale>/messages.json` |
| Short description | `extension_description.message` in the same catalog |
| Detailed description | `<locale>/description.txt` in this directory |
| Store icon | `images/icon-128.png` |
| Privacy policy URL | https://github.com/yuriyapostol/ua-shutdowns/blob/main/PRIVACY.md |
| Privacy practices | [English submission text](privacy-practices.md) · [Ukrainian guidance](privacy-practices.uk.md) |
| Screenshots | Capture the real interface in each listing language; supplied separately |

Upload the extension ZIP, select each supported listing language and paste its description. The manifest references the catalog name and short description. Preserve those catalog values when filling any corresponding fields. Detailed descriptions and screenshots are localized in the dashboard; Privacy practices is a declaration for the extension as a whole, rather than seven separate translations.

Descriptions link to existing English or Ukrainian documentation and clearly label its language. The public policy is maintained in those two languages. Do not imply that help or policies have additional translations.

The descriptions explain the supported regions, manual website-based refresh, offline limitations, Ukrainian address input, independent status, local storage, DTEK processing and user-initiated sharing. They contain no invented address examples or promises of automatic background polling.

These listing materials do not change extension behavior or require replacing the published 0.7.1 ZIP. Keep future behavior changes consistent across every description and the privacy policy.

Validation: `node scripts/check-locales.cjs` checks catalog completeness, name/summary limits and that each existing store locale has a nonempty description and a matching interface catalog. When adding a language, review description parity and the store's detailed-description limit as well.
