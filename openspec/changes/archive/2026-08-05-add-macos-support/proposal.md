## Why

Moji ships for Windows and Linux only. macOS users have no artifact to install, even though the codebase already handles darwin in its file-association and window-lifecycle paths. Packaging alone is not enough: two macOS platform behaviors are currently broken, and shipping without fixing them would produce an app that cannot copy text and cannot quit.

## What Changes

- Package macOS as a universal DMG and ZIP covering Apple Silicon and Intel.
- Install a native application menu on macOS so the system routes clipboard shortcuts to the renderer.
- Route every macOS exit path through the existing unsaved-changes guard and then actually quit the app.
- Build and publish macOS artifacts from the tagged release workflow.
- Keep automatic updates unsupported on macOS, since unsigned bundles cannot self-replace.
- Correct the documented Node.js requirement, which no longer matches the toolchain.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: macOS becomes a supported platform, gains a native application menu, and separates closing the window from quitting the app.
- `automatic-updates`: macOS is declared an unsupported package format.

## Impact

- Adds a `mac` target and entitlements to `electron-builder.yml`, plus a `dist:mac` script.
- Adds menu construction and a quit path to `electron/main.ts`.
- Adds a macOS job to `.github/workflows/release.yml`.
- Declares `engines` in `package.json` and corrects the README requirement.
- Does not change the renderer, IPC contracts, or app version.
