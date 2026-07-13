## 1. Update foundation

- [x] 1.1 Add electron-updater runtime dependency and GitHub publish configuration
- [x] 1.2 Define serializable update state and typed IPC contracts
- [x] 1.3 Implement supported-platform updater orchestration in main process

## 2. Safe application integration

- [x] 2.1 Register updater IPC and initialize startup check in packaged app
- [x] 2.2 Integrate restart-to-install with existing unsaved-document close flow
- [x] 2.3 Expose narrow update API and event subscription through preload

## 3. Renderer experience

- [x] 3.1 Add compact update notification UI with available, progress, ready, and error states
- [x] 3.2 Wire update state and actions into main application flow
- [x] 3.3 Add update strings to all supported locales and reuse existing design tokens
- [x] 3.4 Add purpose-specific icons to every update action button
- [x] 3.5 Add localized manual update check action and status to About view

## 4. Release automation and documentation

- [x] 4.1 Add GitHub Actions workflow for tagged Windows and Linux releases
- [x] 4.2 Document release procedure, supported package behavior, and signing requirement

## 5. Verification

- [x] 5.1 Run TypeScript typecheck and production build
- [x] 5.2 Verify electron-builder effective configuration for Windows and Linux update metadata
