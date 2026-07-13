## 1. Packaging

- [x] 1.1 Add macOS universal DMG and ZIP targets and entitlements to `electron-builder.yml`
- [x] 1.2 Add the `dist:mac` script to `package.json`
- [x] 1.3 Add a macOS job to the tagged release workflow, before the publish job

## 2. macOS platform behavior

- [x] 2.1 Install a native application menu on macOS with the standard Edit and Window roles
- [x] 2.2 Route Cmd+Q, the Dock Quit item, and `before-quit` through the unsaved-changes guard and quit the app

## 3. Toolchain and documentation

- [x] 3.1 Declare the real Node.js requirement in `engines` and correct the README
- [x] 3.2 Document unsigned distribution, Gatekeeper quarantine, and the absence of macOS automatic updates
- [x] 3.3 Run TypeScript typecheck and produce a macOS build
- [x] 3.4 Verify the installed menu from the main process: an app menu, an Edit menu carrying the clipboard roles, and a Window menu
- [x] 3.5 Verify the quit flow end to end: with an unsaved edit, Quit raises the guard and leaves the app running; discarding terminates the process
