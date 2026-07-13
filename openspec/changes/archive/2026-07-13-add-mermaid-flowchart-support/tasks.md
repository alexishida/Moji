## 1. Mermaid rendering foundation

- [x] 1.1 Add bundled Mermaid dependency and update the lockfile.
- [x] 1.2 Mark fenced `mermaid` blocks as escaped flowchart-render candidates while retaining ordinary code-block behavior for other languages.
- [x] 1.3 Create shared asynchronous renderer that accepts only `flowchart` and `graph` definitions, initializes Mermaid in strict mode, produces unique inline SVG, and retains readable source on unsupported or failed rendering.

## 2. Preview and export integration

- [x] 2.1 Run shared Mermaid renderer in `Preview`, applying current preview theme and ignoring stale asynchronous render work.
- [x] 2.2 Await shared Mermaid rendering during export preparation, using light theme and passing resulting self-contained SVG to existing HTML, PDF, and PNG paths.
- [x] 2.3 Add scoped responsive and print-safe Mermaid styles for preview and standalone exports.

## 3. Verification and documentation

- [x] 3.1 Add unit tests for Mermaid candidate detection, valid `flowchart`/`graph` SVG rendering, and malformed or unsupported fallback behavior.
- [x] 3.2 Add export tests confirming HTML, PDF, and PNG receive rendered SVG and invalid Mermaid does not block export.
- [x] 3.3 Update README supported-feature and export descriptions for Mermaid flowcharts.
- [x] 3.4 Run `npm run typecheck` and `npm test`.
