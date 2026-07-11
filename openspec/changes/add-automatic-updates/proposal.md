## Why

Moji users currently need to discover and install every GitHub release manually. Automatic update support gives Windows and Linux AppImage users a safe, consistent path to receive new versions without interrupting unsaved editing work.

## What Changes

- Check GitHub Releases for stable updates after packaged app startup.
- Download compatible NSIS and AppImage updates in background and report progress in app UI.
- Let user restart when ready or defer installation until later.
- Route update-triggered restart through existing unsaved-document protection.
- Publish required installers and update metadata through GitHub Actions on version tags.
- Keep Debian packages outside self-update flow; they continue as manually installed release artifacts.

## Capabilities

### New Capabilities

- `automatic-updates`: Update discovery, download status, user-controlled restart, error handling, and supported-package behavior.

### Modified Capabilities

- `app-shell`: App shell exposes update status and protects unsaved documents before update installation.

## Impact

- Adds runtime dependency `electron-updater`.
- Adds typed update contracts across `electron/shared.ts`, `electron/preload.ts`, and `electron/main.ts`.
- Adds updater orchestration in main process and compact renderer notification UI with all supported locales.
- Adds GitHub publisher configuration and release workflow for Windows x64 NSIS and Linux x64 AppImage/DEB artifacts.
