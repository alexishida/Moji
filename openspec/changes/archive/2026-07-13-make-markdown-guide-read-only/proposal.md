## Why

Bundled Markdown guides currently open like ordinary files, allowing edits and save operations against application resources. Guides are reference content and must not be modified or presented as user-owned documents.

## What Changes

- Mark bundled guide tabs as read-only document state.
- Disable Editor and Save actions while a guide is active.
- Reject save/edit requests defensively even when triggered through shortcuts or stale callbacks.
- Keep preview, search, outline navigation, export, and tab closing available.
- Show localized notice when a blocked save is attempted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-viewing`: Bundled localized guides open as read-only reference documents.

## Impact

- Extends renderer document state in `src/App.tsx` with read-only metadata.
- Updates `TopBar` capability props and all supported locale notices.
- Does not alter sample contents, IPC contracts, or package version.
