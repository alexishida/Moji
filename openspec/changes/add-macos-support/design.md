## Context

`electron/main.ts` already contains darwin branches (`open-file`, `window-all-closed`, `activate`), so macOS was partially anticipated but never packaged or exercised. Two platform assumptions inherited from Windows and Linux break on macOS:

- `Menu.setApplicationMenu(null)` is harmless where the menu is only a visible bar, but on macOS the application menu is what dispatches clipboard shortcuts. With no menu, Cmd+C, Cmd+V, Cmd+X and Cmd+A never reach the renderer, disabling copy and paste in the CodeMirror editor and in the search fields.
- The close guard ends in `mainWindow.close()`. On Windows and Linux the last window closing quits the process. On macOS `window-all-closed` deliberately does not quit, so every exit path would close the window and leave Moji running in the Dock.

## Goals / Non-Goals

**Goals:**

- Produce an installable macOS artifact for both CPU architectures.
- Restore clipboard shortcuts on macOS.
- Make quit mean quit, without bypassing the unsaved-changes guard.

**Non-Goals:**

- Code signing and notarization, which require a paid Apple Developer account.
- Automatic updates on macOS, which depend on signing.
- Moving app actions (Open, Save, Export, theme) into the native menu; they stay in the in-app top bar on every platform.

## Decisions

### Ship a universal binary rather than per-architecture artifacts

One DMG runs on Apple Silicon and Intel, so the download page needs no CPU choice and a user cannot pick the wrong build. The cost is size: the universal DMG is roughly 215 MB against roughly 110 MB per single-architecture build, because both Electron binaries travel together. Distribution simplicity outweighs bytes for a desktop editor released a few times a year. Revisit if release size becomes a constraint.

### Install the menu only on macOS

Windows and Linux keep `Menu.setApplicationMenu(null)`: their menu bar is redundant with the in-app top bar and hiding it is deliberate. macOS gets the system roles it actually needs, `editMenu` and `windowMenu`, plus an app menu. This keeps one platform-specific branch instead of a cross-platform menu that would duplicate the top bar.

### Keep the app menu limited to system roles

The menu carries no Open, Save, Export or theme items. Those already exist in the top bar with working shortcuts, and duplicating them in a menu would create two sources of truth for enablement state (read-only guides, no active document). The menu exists to satisfy a macOS system contract, not to become a second UI.

This leaves the pre-existing `Native application menu` requirement in `app-shell` unmet, as it has been since it was written. The requirement is rewritten to describe the shipped behavior instead of continuing to assert a menu that does not exist on any platform.

### Route quit through the renderer guard with an explicit flag

`requestQuit()` sets `pendingQuit` and asks the renderer to confirm, exactly like a window close. `confirmClose(true)` then branches on the flag: `app.quit()` when quitting, `mainWindow.close()` when merely closing a window. An `app.on('before-quit')` handler catches the paths that do not originate from the menu, notably Quit from the Dock context menu, and redirects them into the same guard.

`forceQuit` remains the single escape hatch that lets the second, real quit through without re-prompting.

### Re-arm the guard on every new window

`forceQuit` is raised once a close is approved and was never lowered. On Windows and Linux the process dies with the window, so the flag never outlives its purpose. On macOS the app survives its last window, so a window opened afterwards inherited the raised flag and closed **without ever asking about unsaved changes**: work was discarded in silence.

The flag is therefore cleared in `createWindow`, so every window starts with the guard armed. This is a pre-existing defect that only becomes reachable once the app correctly stays alive on macOS, which is why it is fixed here rather than left for later.

### Leave automatic updates unsupported on macOS

Squirrel.Mac refuses to replace an unsigned bundle, so enabling the updater would surface a permanently failing flow. `supportsAutomaticUpdates()` already returns false on darwin; the behavior is now documented rather than incidental. macOS users update by downloading a new DMG.

## Risks / Trade-offs

- [Unsigned build is quarantined by Gatekeeper] → Documented in the README, with both the right-click Open path and the `xattr -dr com.apple.quarantine` command. `hardenedRuntime` and an entitlements file are configured so enabling signing later is a credentials change, not a code change.
- [Cmd+Q accelerator in the menu could bypass the guard] → The quit item is a custom item calling `requestQuit()`, not `role: 'quit'`, which would call `app.quit()` directly.
- [`before-quit` could recurse when the guard approves the exit] → The handler returns early once `forceQuit` is set, which happens before `app.quit()` is called.
- [Universal DMG doubles download size] → Accepted; see the decision above.

## Migration Plan

No persisted state and no IPC contract changes. Windows and Linux packaging is untouched: the menu branch and the quit branch are both no-ops off darwin.

## Open Questions

None.
