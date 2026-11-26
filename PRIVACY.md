# Privacy policy — UA Shutdowns

**English** · [Українська](PRIVACY.uk.md)

Last updated: 25 November 2026. Applies to UA Shutdowns 0.7.1 and its current data handling.

UA Shutdowns is an independent Chrome extension maintained by Yuriy Apostol. It is not an official DTEK product.

## Purpose and information handled

The extension helps you retrieve, view, archive and share power outage schedules from supported regional DTEK websites. It handles:

- Addresses you enter: regional operator, locality, street and building number.
- Outage groups, dates, outage intervals, supply lines, observation times and saved schedule versions read from supported schedule pages.
- Interface language, popup-closing preferences and related preference timestamps.
- Locally generated identifiers and address-to-schedule links. Temporary tab identifiers and address selections associate an open DTEK tab with the selected address.

It checks the active tab URL to recognize a supported DTEK page and communicate with that page. It does not build a browsing-history archive or track visits to unrelated websites. When enabled, popup closing examines and dismisses obstructing popups on supported schedule pages.

## Local storage and access

Addresses, preferences and schedule history are stored in Chrome's local extension storage on your device. Temporary tab selections use session storage. The extension does not use Chrome storage sync, a developer-operated backend, analytics, advertising trackers or telemetry. It does not send your saved addresses or schedules to the developer.

Local storage is managed by Chrome; UA Shutdowns does not add its own encryption layer. Access to your device or browser profile may expose locally stored information.

## DTEK websites and sharing

To retrieve a schedule, the extension enters the selected address into the corresponding DTEK website form. That website processes the address and makes its own network requests over HTTPS. DTEK websites operate independently and apply their own privacy policies; their ordinary web requests may include your IP address, cookies and browser information. The extension does not send addresses to an additional developer service.

Copying a schedule places the displayed text on your clipboard. QR codes are generated locally without an external QR service. The text may include the locality, outage group and any text you add. Someone who scans the QR code or receives copied text can read its contents. Copying, editing and sharing are initiated by you; the extension does not automatically publish schedules.

## Retention and deletion

Schedule archives default to 365 days of retention, configurable in Settings. Older schedule dates and linked address history entries are removed when schedules are read or saved; a retention change applies immediately. You can edit or delete addresses in the extension. Deleting an address removes its street, building and private history links from the current address records; locality and group archives remain without streets or buildings. You can delete group archives in Settings → Schedule archives. Removing a shared archive also removes its linked schedules from address histories. Locality metadata may remain after deleting an archive.

Uninstalling the extension removes its Chrome-managed extension storage. Files, clipboard contents, screenshots, backups or text you saved or shared separately are outside this deletion; remove these separately where needed. Uninstalling does not delete records independently held by DTEK or recipients.

## Limited use and changes

User data is used only to provide the extension's described features, in compliance with the Chrome Web Store User Data Policy, including its Limited Use requirements. The developer does not sell user data, use it for advertising or credit decisions, or provide human access to locally stored data through the extension.

Changes to data handling will be reflected in this policy with an updated date.

## Contact

Maintainer: Yuriy Apostol. For privacy questions, open a [GitHub issue](https://github.com/yuriyapostol/ua-shutdowns/issues). Issues are public: do not include your home address, private schedules or other sensitive information.
