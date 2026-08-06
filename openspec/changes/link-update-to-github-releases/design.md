## Context

See `proposal.md` for motivation. Current update detection uses `electron-updater`, then exposes check, download, and install controls through the main/preload/renderer boundary. The renderer already routes external HTTP(S) links to the system browser, and the repository has a canonical releases URL.

## Goals / Non-Goals

**Goals:**

- Preserve supported-package release detection and update-state notifications.
- Give users one consistent manual-update destination from notice and About view.
- Remove obsolete local-download and local-install contracts and UI states.

**Non-Goals:**

- Changing GitHub release publishing, installers, or update metadata.
- Adding update checks for unsupported development, macOS, or Linux DEB builds.
- Selecting a platform-specific asset or downloading it on behalf of the user.

## Decisions

### Keep release detection; replace only acquisition

Continue checking stable releases for supported packaged builds, but map an available release to a GitHub Releases link instead of `electron-updater` download/install operations. This retains automatic notification while avoiding unreliable in-app installation. Polling GitHub from renderer was rejected because it would duplicate version and platform logic and weaken the process boundary.

### Use one canonical external destination

Both primary buttons target `https://github.com/alexishida/Moji/releases`, opened by existing system-browser link handling. A release-specific URL was rejected because it could break if the detected release is removed or unpublished; the releases page remains a stable destination and lets user choose matching asset.

### Reduce update contract to discovery state

Remove download/install IPC channels, preload methods, controller methods, and renderer callbacks. Preserve `idle`, `checking`, `up-to-date`, `available`, `unsupported`, and `error`; remove download progress and ready-to-install states. This eliminates restart flow and its unsaved-document coupling.

### Reuse primary action styling

Use existing `btn btn--primary` styling for localized update buttons, preserving current compact notification and About layouts. Add the available-update action in About without replacing manual check action when no update is available.

## Risks / Trade-offs

- [User must choose installer manually] → Send user to official releases page and keep version-visible update notice.
- [Release discovery still depends on updater metadata] → Keep clear localized retry state; this change does not claim to repair GitHub publishing metadata.
- [Old update state can persist during migration] → Ensure renderer only renders states retained by revised contract and TypeScript prevents stale callbacks.

## Migration Plan

1. Replace local update actions and states in contracts, main process, preload, and renderer.
2. Add localized primary update actions for the notice and About view, both targeting official releases.
3. Run typecheck and focused update-component tests; build packaged artifacts to verify supported update checks still surface availability.
4. Roll back by restoring the previous updater controller and its IPC/UI actions if release detection regresses.
