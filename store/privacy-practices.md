# Chrome Web Store — Privacy practices

**English** · [Українська](privacy-practices.uk.md)

Prepared for manifest 0.7.1 on 25 November 2026. These are submission notes, not a substitute for the dashboard fields or the [privacy policy](../PRIVACY.md). Copy the relevant answers into Chrome Web Store Developer Dashboard → Privacy practices. Verify against the actual form before submission.

## Single purpose description

Retrieve, view, archive and share DTEK power outage schedules for user-selected addresses in supported Ukrainian regions.

## Permission justifications

| Field | Text to copy |
| --- | --- |
| storage | Store user-entered addresses, outage groups, schedule history and preferences locally. Session storage associates a DTEK tab with its selected address. Data is not synced to a developer backend. |
| unlimitedStorage | Keep a user-controlled local archive of daily outage schedules and their versions with configurable retention (365 days by default). This prevents Chrome's normal local storage quota from interrupting archive retention. Users can delete archives in Settings. |
| activeTab | When the user opens the extension, inspect the active tab URL to recognize a supported DTEK schedule page, refresh its displayed schedule and reuse the current DTEK tab when opening a saved address. No general browsing-history archive is created. |
| Host access / content scripts, if shown | Content scripts run only on HTTPS /ua/shutdowns pages of dtek-kem.com.ua, dtek-krem.com.ua, dtek-dnem.com.ua, dtek-oem.com.ua and dtek-dem.com.ua, including subdomains. They fill the selected address, read outage groups and displayed schedules, and optionally dismiss obstructing popups. |

## Remote code

Select **No, I am not using remote code**. All executable extension code and the QR generator are bundled in the installation ZIP. Reading data from a DTEK page is not downloading executable extension code.

## Data usage

Do not confuse “the developer receives no data” with “the extension handles no data”. Addresses are stored locally and entered into third-party DTEK forms. Schedule content is read from those sites. The FAQ requires disclosure of local processing too.

Recommended categories to review against the dashboard's exact definitions:

| Category | Reason |
| --- | --- |
| Personally identifiable information | User-entered street/building addresses; no names, email addresses or account credentials are requested. |
| Location | The selected postal location (region, locality, street, building); no GPS, IP geolocation or live device location is requested. |
| Website content | Outage groups, dates and schedule intervals read from DTEK schedule pages. |

Do not declare health information, financial/payment information, authentication information or personal communications: the extension does not collect them. It does not record clicks, mouse movement or keystrokes for analytics. It checks the active tab URL for its feature, but does not build or transmit a browsing-history archive; if the form's definition includes this necessary URL processing, disclose it under Web history as applicable. Review the live wording rather than treating this document as a completed declaration.

The three Limited Use certifications are consistent with the current implementation: no sale or transfer outside permitted use, no unrelated use or transfer, and no use for creditworthiness or lending. Check them only after reviewing the statements in the dashboard.

## Privacy policy URL

https://github.com/yuriyapostol/ua-shutdowns/blob/main/PRIVACY.md

Use this URL after the policy is present on main. The policy links to the Ukrainian version. No extension version bump is needed just to publish these repository documents; the already published 0.7.1 ZIP is unchanged.

## References

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
