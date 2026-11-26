# UA Shutdowns — DTEK power outage schedules

**English** · [Українською](README.uk.md)

Power outage schedules for your addresses. A Google Chrome extension that makes it easier to get, view and share schedules from DTEK websites.

## Features

- Save multiple addresses and view the outage group and outage times for each one.
- Open the relevant DTEK website and fill in your address automatically.
- Keep a history of received schedules and view them by date, including offline.
- Copy a schedule or transfer it to your phone using a QR code.
- Optionally close popups on DTEK websites that obstruct the schedule.

## Supported regions

Only schedules from the following DTEK regional websites are supported:

| Region | Schedule website |
| --- | --- |
| Kyiv | [Kyiv Grids](https://www.dtek-kem.com.ua/ua/shutdowns) |
| Kyiv region | [Kyiv Regional Grids](https://www.dtek-krem.com.ua/ua/shutdowns) |
| Dnipropetrovsk region | [Dnipro Grids](https://www.dtek-dnem.com.ua/ua/shutdowns) |
| Odesa region | [Odesa Grids](https://www.dtek-oem.com.ua/ua/shutdowns) |
| Donetsk region | [Donetsk Grids](https://www.dtek-dem.com.ua/ua/shutdowns) |

Power outage schedules from other companies are not currently supported. We are considering adding them in the future.

## Installation

Requires **Google Chrome 127 or later**.

### From the Chrome Web Store — after publication

The extension has not been published in the Chrome Web Store yet. Once it is published, this will be the recommended installation method:

1. Open the [Chrome Web Store](https://chromewebstore.google.com/) in Google Chrome and search for **UA Shutdowns**.
2. Open the extension page and click **Add to Chrome**.
3. Confirm installation in the browser dialog.
4. Pin UA Shutdowns to the Chrome extensions toolbar for easy access.

This method does not require downloading an archive or enabling Developer mode. See [Google's extension installation guide](https://support.google.com/chrome_webstore/answer/2664769?hl=en).

### From an archive — available now

Until the extension is published in the store, you can install it manually from GitHub. After publication, this method will remain an alternative for manual installation and testing:

1. Download the ZIP from the [latest release](https://github.com/yuriyapostol/ua-shutdowns/releases/latest) and extract it to a separate folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin UA Shutdowns to the Chrome extensions toolbar for easy access.

## How to use

### Add an address and get a schedule

1. Open the extension and click **Add address**.
2. Select a DTEK regional operator, enter your address and save it. The city is already selected for Kyiv.
3. Click the saved address. The extension will open the DTEK website and fill in its address form.
4. Wait for the schedule to appear on the website, then open the extension to view the received outage times.

You can add multiple addresses.

Enter addresses in Ukrainian, as they appear on the DTEK website, regardless of the interface language. Otherwise, the address will not be found. For example: city — `Київ`, street — `Хрещатик`, building — `22`.

### Edit an address

Click the pencil next to an address, make your changes and click **Save**.

Changes to case, spaces, or adding/removing a street or locality type save directly, keeping the group and schedules. For example, `17 А` → `17 а`.

For other changes, the extension shows **Before / After** and asks you to choose:

- **Correcting the address** — keep its history.
- **This is a different place** — start a new history while keeping previous group archives.

Changing a type (street → lane, city → village), a building letter or a digit may mean a different place. After such changes, open the address on the DTEK website to verify its group again.

### View schedules by date

On the home screen, choose today, tomorrow or another date using the arrows or calendar. Schedules for buildings with two supply lines are displayed separately.

In Settings, choose Ukrainian, English, German, French, Spanish, Italian, Polish, or **Same as browser** (the default). The automatic option follows Chrome's interface language and uses English for unsupported languages. Changes are saved and applied immediately, including shared schedule text. Date formats and calendar weeks follow the user’s locale, including its regional settings: date component order and separators, month and weekday names, and the first day of the week. For example, US English uses `MM/DD/YYYY` and weeks starting on Sunday; British English uses `DD/MM/YYYY` and weeks starting on Monday. When Chrome’s language matches the chosen translation, its regional settings are preserved; otherwise the translation’s default locale is used. Outage dates always refer to the time in Kyiv.

The extension receives data from the active DTEK tab. To update the schedule for an address, click it and wait for the website to load its data. Only previously saved schedules are available offline.

**Schedule not received** or **Schedule not saved** means there is no data for the selected date. It does not mean there will be no outages.

### Archives and deletion

Schedules are kept for **365 days** by default. Change the retention period in days in **Settings**. Older schedule dates and their links in address histories are removed when stored schedules are read or saved; changing the period applies immediately. Under **Settings → Schedule archives**, cards grouped by region show the locality, outage group, saved day count and total record count (including different versions). Use the trash icon to delete an archive, with confirmation.

To delete an address, open it for editing and click the trash icon. Its street and building are removed; group archives remain. For a new or re-added address, saved schedules appear after its group is confirmed on the website. Each date shows the version with the latest received timestamp; if all versions lack timestamps, the last entry in the list is used. Timestamp ties also use the last entry. Previous versions remain in the archive.

Storage schema 2 keeps only address/date links to an `archiveId` in `histories`, without a reference to a specific schedule version. This preserves the history of previous address groups and regions; the latest version is selected from the linked archive. Schema 1 is not converted automatically.

Delete an archive separately in Settings, with confirmation. This also removes its schedules from every linked address's history.

### Share a schedule

Click **Share schedule** next to an address. On the sharing screen, copy the text or scan the QR code with your phone camera.

You can edit the text before copying it. The QR code will also contain the edited text; the saved schedule remains unchanged.

### Close popups

In **Settings**, enable automatic closing of popups on DTEK websites. The extension may also offer to enable this when it detects a popup.

## Privacy and stored data

[Full privacy policy](PRIVACY.md) · [Chrome Web Store privacy submission notes](store/privacy-practices.md)

Addresses, settings and schedule history are stored only locally in your browser. The extension does not send this data to the developer and does not use analytics or tracking.

To retrieve a schedule, the selected address is entered into the form on the relevant DTEK website and processed by that website. Schedules are shared only when you choose to do so; QR codes are generated locally without sending their content to external services.

Group archives contain no streets or buildings. Uninstalling the extension clears all its stored data; separate backup files on disk remain.

## Updates and help

If you installed the extension from an archive, download the new release ZIP and replace the files in the installation folder. Click the extension's reload button at `chrome://extensions` and reload any open DTEK pages.

If an address appears under **Select a regional operator**, edit it, select a region and save it.

[Chrome Web Store](https://chromewebstore.google.com/) · [GitHub releases](https://github.com/yuriyapostol/ua-shutdowns/releases) · [Changelog](CHANGELOG.md) · [Report a problem](https://github.com/yuriyapostol/ua-shutdowns/issues)

## For developers

To install from source, select the repository folder in the **Load unpacked** step.

QR codes use [qrcode-generator v3.4.0](https://github.com/yuriyapostol/qrcode-generator/tree/v3.4.0), declared in `package.json`. Required modules are committed in `vendor/`, so installing the extension needs no npm or build step.

Development checks:

```sh
npm ci --ignore-scripts
npm run vendor:check
npm test
```

To update the library, replace `<version>` with its version number:

```sh
npm install --ignore-scripts --save-exact "qrcode-generator@github:yuriyapostol/qrcode-generator#v<version>"
npm run vendor:sync
npm run vendor:check
npm test
```

Commit `package.json`, `package-lock.json` and `vendor/` changes together. CI verifies that the local modules match the locked dependency.

To prepare a new release, update the version in `manifest.json`, add matching entries to both changelogs and publish the tag `v<version>`. GitHub Actions will run the checks and create a Release with an installation ZIP and bilingual release notes, Ukrainian first and English second.

To add interface or Chrome Web Store languages, see the [translation guide](TRANSLATING.md). Catalogs include translator context and named placeholders; checks automatically discover all locales. Ready-to-use detailed store descriptions are in `store/<locale>/description.txt`. Documentation stays bilingual.
