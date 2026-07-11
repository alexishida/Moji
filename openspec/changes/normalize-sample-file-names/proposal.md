## Why

Bundled Markdown guide filenames mix English and Portuguese naming conventions and treat the base languages differently from suffixed translations. A locale-based pattern makes every sample predictable and prevents mappings from drifting as languages are added.

## What Changes

- Rename all six bundled guide files to `markdown-guide.<locale>.md`.
- Use canonical supported locale codes: `en`, `pt-BR`, `es`, `ja`, `zh`, and `ru`.
- Update main-process allowlist, renderer language mapping, and documentation references.
- Preserve every file's content unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `internationalization`: Bundled localized guide resources follow a stable locale-based filename convention and remain selectable from active language.

## Impact

- Renames files under `samples/` without changing content.
- Updates `electron/main.ts`, `src/App.tsx`, and `README.md` references.
- Does not change package version, user settings, or IPC contracts.
