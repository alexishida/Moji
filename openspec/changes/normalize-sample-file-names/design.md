## Context

Moji ships one Markdown guide per supported locale. Current names use three unrelated shapes: English description, unsuffixed Portuguese description, and Portuguese stem plus suffix for four translations. Main process protects sample reads with a filename allowlist; renderer independently maps active language to filename.

## Goals / Non-Goals

**Goals:**

- Give every guide one predictable filename derived from supported locale.
- Keep main allowlist and renderer mapping consistent.
- Preserve guide contents and language selection behavior.

**Non-Goals:**

- Rewrite, merge, or translate guide content.
- Change supported locales or add dynamic sample discovery.
- Change sample IPC or package version.

## Decisions

### Use `markdown-guide.<locale>.md`

English resource name provides neutral common stem, while exact BCP 47-style app locale identifies content. All languages, including English and Portuguese, receive suffix; no language gets implicit default filename.

### Keep explicit allowlist and mapping

Explicit main allowlist prevents arbitrary bundled path reads. Explicit renderer mapping preserves compile-time coverage of `Language`. Generating paths from renderer input would weaken allowlist intent without meaningful benefit for six fixed locales.

### Rename through source-control-aware moves

Files move without content rewrite. References update in same change so Linux case-sensitive packages cannot contain broken paths.

## Risks / Trade-offs

- [Stale filename reference causes guide-open failure] → Search old stems repository-wide and run typecheck/build after moves.
- [Case mismatch for `pt-BR`] → Use exact `SUPPORTED_LANGUAGES` spelling in filename and mapping.
- [Git records delete/add instead of rename] → Content remains byte-identical; source control detects renames by similarity.

## Migration Plan

Rename all files and update consumers atomically. No user data migration required because samples are bundled read-only resources.

## Open Questions

None.
