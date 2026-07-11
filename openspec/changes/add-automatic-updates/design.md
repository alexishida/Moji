## Context

Moji is distributed with electron-builder as Windows NSIS, Linux AppImage, and Linux DEB artifacts. It has no publisher configuration, release automation, update runtime, or renderer update state. Existing close protection is renderer-driven: main requests close, renderer confirms, and main quits only after approval.

## Goals / Non-Goals

**Goals:**

- Self-update packaged Windows NSIS and Linux AppImage builds from public GitHub Releases.
- Download updates in background while showing useful status and progress.
- Reuse unsaved-document close protection before explicit update restart.
- Preserve sandboxed renderer and narrow typed IPC.
- Produce platform metadata and artifacts reproducibly from version tags.

**Non-Goals:**

- Self-update Linux DEB installations or require root access.
- Support prerelease channels, downgrades, private repositories, or macOS.
- Add custom AppImage installation/desktop integration.
- Force immediate restarts.

## Decisions

### Use electron-updater with electron-builder GitHub provider

`electron-updater` understands NSIS/AppImage metadata, verifies SHA-512 values, supports differential downloads, and shares electron-builder release configuration. A custom downloader/replacer would duplicate security-sensitive platform logic.

### Keep update orchestration in dedicated main-process module

New `electron/updater.ts` owns updater listeners, state, checks, download, and installation. Main registers narrow IPC handlers; preload exposes typed methods/events. Renderer receives serializable state only.

### Require user action before downloading and restarting

Startup check reports availability. User starts download, sees progress, then chooses restart or later. This avoids unexpected bandwidth and editing interruption. Downloaded update remains eligible for install on normal app exit.

### Route explicit installation through existing close protocol

Renderer requests installation only after its own dirty-document confirmation succeeds. Main also retains normal close interception until it receives confirmation, then calls `quitAndInstall`. This avoids bypassing unsaved work protection.

### Limit self-update to packaged NSIS and AppImage builds

Development builds do not check. Linux self-update is enabled only when `APPIMAGE` exists. DEB builds expose `unsupported`, preventing root-dependent package replacement.

### Build releases per operating system in GitHub Actions

Tag `v*` triggers Windows and Ubuntu jobs using one package version. Each job publishes directly to same non-draft GitHub Release through electron-builder using repository `GITHUB_TOKEN`. Windows emits `latest.yml`; Linux emits `latest-linux.yml` with AppImage and DEB artifacts.

## Risks / Trade-offs

- [Unsigned Windows installer can trigger SmartScreen] → Preserve signing hooks via standard electron-builder environment variables and document certificate as production prerequisite.
- [GitHub jobs can race while editing one release] → Use electron-builder publish from separate jobs; GitHub provider supports uploading distinct artifacts, while tag/version naming avoids collisions.
- [Update metadata and binary mismatch] → Build and publish metadata with matching artifact in same job; never hand-edit release metadata.
- [AppImage path is read-only] → Surface updater error without data loss; user can install current AppImage in user-writable location.
- [Update check network failure] → Keep failure non-blocking and allow manual retry through update notice when error state is visible.

## Migration Plan

1. Merge runtime, UI, publisher config, and workflow without changing current package version.
2. Create next semantic version tag and let CI create first update-capable release.
3. Users installing that release become eligible for subsequent automatic updates.
4. Roll back by removing/bypassing updater initialization in a higher-version release; already downloaded updates cannot be recalled without publishing a newer fixed version.

## Open Questions

- Windows code-signing certificate and secrets must be provisioned before broadly distributing installer.
