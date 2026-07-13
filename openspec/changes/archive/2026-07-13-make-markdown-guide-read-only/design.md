## Context

Sample guides are read through guarded IPC but returned with their real bundled path. Renderer currently treats every returned document as editable and saveable, so development builds can overwrite source samples and packaged builds can attempt writes inside app resources.

## Goals / Non-Goals

**Goals:**

- Make every guide opened from status bar immutable in workspace.
- Communicate unavailable actions through disabled controls and localized fallback notice.
- Preserve all reading and export capabilities.

**Non-Goals:**

- Make arbitrary filesystem documents read-only.
- Change sample read IPC or filesystem permissions.
- Prevent export of guide content.

## Decisions

### Store read-only status on document state

`DocumentInput.readOnly` flows into `DocumentState.readOnly`. This explicit origin metadata is safer than inferring from filesystem paths in renderer and remains stable when tab becomes inactive.

### Enforce protection at UI and action layers

Top bar disables Save and Editor. `setModeSafe`, content mutation, `saveDocument`, and `saveDocumentAs` also reject read-only tabs. Multiple checks protect shortcut/menu paths and future callers.

### Keep guide path for preview assets and identity

Guide retains real path, preserving relative asset resolution and duplicate-tab detection. Read-only flag, not null path, controls mutability.

## Risks / Trade-offs

- [New document state field omitted by a caller] → Default `readOnly` to false in centralized `addDocuments`.
- [Stale edit mode when switching to guide] → Guide opens with view mode and edit transition checks active document flag.
- [Blocked save lacks feedback through non-UI caller] → Action guard displays localized read-only notice.

## Migration Plan

No persisted document state exists. New field applies when documents enter current session.

## Open Questions

None.
