## 1. Update contract and release detection

- [x] 1.1 Reduce update status, controller, IPC, preload, and renderer API contracts to release-check operations; remove local download/install and restart paths.
- [x] 1.2 Preserve supported-package GitHub Release checks and recoverable error state without progress or downloaded-update states.
- [x] 1.3 Add or update focused tests for available, current, unsupported, and failed release-check states.

## 2. Update user interface

- [x] 2.1 Replace notification download/restart/progress UI with blue localized update button linking to `https://github.com/alexishida/Moji/releases` in system browser.
- [x] 2.2 Show an equivalent blue localized update button in About only while an update is available; retain check action for other states.
- [x] 2.3 Remove obsolete update callbacks, state handling, icons, and styles while preserving dismiss and retry behavior.

## 3. Localization and verification

- [x] 3.1 Update all supported locale strings for manual GitHub Releases update flow and remove unused download/install text.
- [x] 3.2 Update README automatic-update description to state that users are notified and download from GitHub Releases.
- [ ] 3.3 Run `npm run typecheck` and relevant tests; manually verify notice and About links open externally without closing the editing session.
