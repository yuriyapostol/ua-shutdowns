# Changelog

**English** · [Українська](CHANGELOG.uk.md)

## 0.6.1 — 2026-11-24

- Declared `yuriyapostol/qrcode-generator` as a GitHub dependency pinned to the `v3.4.0` tag, with its exact source commit and transitive dependencies recorded in `package-lock.json`.
- Added `npm run vendor:sync` and `npm run vendor:check` to update the required QR modules, license notice and source information, and detect differences from the locked dependency.
- Added dependency installation, vendor verification and automated tests to CI for main-branch changes, pull requests and releases. Added tests for synchronization and UTF-8 SVG QR generation.
- Simplified the QR library update instructions in both README versions. The library remains at version 3.4.0; installing and running the extension still requires no npm or build step.

## 0.6.0 — 2026-11-23

- Clarified DTEK coverage in the extension name, description, window headers and regional operator field.
- Added a complete English interface with automatic language selection based on Chrome's interface language. Other languages fall back to English.
- Localized date entry, calendar month and weekday names, the first day of the week, and shared schedule text. US English uses `MM/DD/YYYY`; British English uses `DD/MM/YYYY`. Ukrainian retains `DD.MM.YYYY`.
- Prepared the interface for additional languages without JavaScript changes: descriptive message keys, translator context, named placeholders and locale settings in each catalog. Added automatic validation of all language catalogs.
- Reorganized the README for users, made English the main documentation language and added Ukrainian versions with language links. Documented installation, DTEK coverage, local data storage and privacy.
- Added English and Ukrainian Chrome Web Store descriptions, including the extension's independent, unofficial status, and bilingual instructions for adding interface and store translations.
- GitHub release notes are now generated from both changelogs, with Ukrainian first and English second. Publishing stops if either language's release entry is missing or empty. Release archives include all interface catalogs and both documentation languages.

## 0.5.2 — 2026-11-22

- The date field automatically selects the day, month or year when moving to a different component. Moving the cursor within a component and manual selections remain unchanged. Focusing without clicking or opening via the calendar icon selects the day.
- Fixed Tab and Shift+Tab navigation between the date control and the open calendar, skipping unavailable controls. Replaced the dropdown arrow with a compact calendar icon.
- Increased text contrast for field values, city names and outage groups in address cards. Increased time intervals to 15 px and removed the colon after the group label. Centered action result messages.
- Disabled field autofill and added a pointer cursor over dropdown arrows.
- Added a project GitHub link at the bottom of the home screen.

## 0.5.1 — 2026-11-22

- Replaced the system date picker with a custom Ukrainian calendar with quick month and year selection and keyboard navigation. The current day has an outline; the selected day has a yellow background.
- Dates can be edited directly in `DD.MM.YYYY` format. Enter or leaving the field confirms input; Escape cancels changes. Invalid dates are marked as errors.
- The calendar opens over schedules when the date field is activated and adapts to available space. Added dropdown shadows and scrolling for long lists, and increased the regional operator list height.
- Unified field fonts, hover and focus styles. Replaced checkmarks in select lists with yellow highlighting and prevented month names from wrapping.
- Added rounded corners around the QR code. Updated extension icons and enlarged the header logo.

## 0.5.0 — 2026-11-21

- Added a Share schedule screen with the selected day's schedule text, a copy button and a QR code for phones. Replaced the copy button in address cards with a share button.
- Schedule text can be edited before sharing without changing the saved schedule. Copying uses the edited text; the QR code updates after a 500 ms typing pause.
- QR codes are generated locally using `yuriyapostol/qrcode-generator`, with Ukrainian text support. Package modules are included in the extension archive.
- Fixed schedule synchronization: opening the extension rereads the active DTEK tab's table and displays cards after the latest data has been saved.
- Schedule observation continues when the website replaces the table, loads it late, or the initial save fails.
- Aligned text input and select styling: shared fonts, hover and focus effects, more compact labels, a dropdown matching the select width, and an arrow that rotates when opened. Clicking labels no longer activates fields.

## 0.4.1 — 2026-11-19

- Updated button and checkbox styling and moved the back button into the screen heading.
- Moved address deletion confirmation to a separate screen, with a return to editing that preserves unsaved changes.
- When editing, the save button is enabled only after changes. For an unchanged address it is yellow and disabled. When adding an address it is enabled immediately.

## 0.4.0 — 2026-11-16

- Added recognition of today's and tomorrow's DTEK schedules: full-hour and half-hour outages are merged into continuous intervals. Schedules for two supply lines are displayed separately.
- Address cards display the outage group and intervals for the selected day. Groups and schedules update after address selection and when the visible tab's table changes.
- Added date selection with arrows, a calendar and compact today, tomorrow and other date shortcuts that share the same selection state.
- Added copying of a text schedule with its date, weekday, region, city, outage group and intervals.
- Schedules are stored by date with each day's outage group. Current and future days update, while past days remain in the archive. Missing website data does not erase the last received schedule.
- Separated the archive from the address list: deleting an address normally retains its history, and adding it again restores it. An unchecked-by-default Delete the archive for this address option allows full removal. Previously saved schedules are migrated automatically.
- Added the `unlimitedStorage` permission for long-term local archives without automatic data expiration.
- After detecting a popup in the active DTEK tab, the extension automatically offers to enable popup closing. Declining postpones the offer for 31 days. Detection resumes immediately when returning to the tab.
- Moved address selection from a service URL fragment into internal tab state. Old fragments are removed while preserving the selection. Different tabs remain independent.
- Updated address list styling, icons, highlighting and button layout. Added a background service worker and a minimum Chrome version of 127 for opening the extension window automatically.

Verified with 126 automated tests and browser scenarios covering addresses, dates, copying, and retaining or deleting archives.

## 0.3.1 — 2026-10-29

- Replaced the Edit label in the address list with an icon with an accessible name and tooltip.
- Shortened the README Features section.
- Fixed opening second and subsequent addresses in the current tab: reloading occurs only after confirming the selected address URL.
- If navigation is unconfirmed or fails, the previous address is not reloaded.

## 0.3.0 — 2026-10-29

- Added the Power outage schedule home screen with addresses grouped by DTEK regional operator.
- Added separate screens for adding and editing addresses and for settings. Address deletion requires confirmation.
- Clicking an address opens its schedule in the current tab of any supported DTEK website. From other pages, it opens a new tab.
- Each tab receives a selected address ID so different addresses do not overwrite one another's selection.
- Previously saved addresses are migrated to the list. Their region must be selected before first opening.
- Added the temporary `activeTab` permission to identify the current website after clicking the extension icon.

Verified with 57 automated tests and browser scenarios covering adding, editing, opening, deleting and migrating addresses.

## 0.2.0 — 2026-10-29

- Added support for all five DTEK regional websites: Kyiv, Kyiv region, Dnipropetrovsk region, Odesa region and Donetsk region.
- Accounted for Kyiv's form without a city field. Addresses from other cities are not entered into it.
- Preserved automatic address selection and popup closing on all supported pages.
- Updated the extension description and documentation. Added a changelog and downloads via GitHub Releases.

Verified on live regional websites. All 45 automated tests passed.

## 0.1.1 — 2026-10-28

- Renamed the extension to UA Shutdowns.
- Added a settings window with addresses saved locally in the browser.
- Removed the default address: automatic selection does not run until an address has been saved.
- Changed searching to use whole words with progressive refinement and added comparison of similar spellings.
- Automatic selection stops after user interaction, failed searches or a timeout.
- Added an automatic popup closing checkbox, immediate saving and repeated closing attempts.
- Aligned the window styling with DTEK's design. Fonts work offline.

## 0.1.0 — 2024-07-17

- Initial extension for DTEK Kyiv Regional Grids.
- Automatically selected a city, street and building from an address specified in code.
- Added Ukrainian and English localization.
