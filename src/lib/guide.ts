/** Built-in Markdown syntax cheat sheet, opened from the status bar "Guide" link. */
export const GUIDE_MARKDOWN = `# Markdown Guide

A quick reference for the syntax this editor supports.

## Headings

\`\`\`markdown
# H1
## H2
### H3
\`\`\`

## Emphasis

- \`*italic*\` → *italic*
- \`**bold**\` → **bold**
- \`\\\`code\\\`\` → \`code\`

## Lists

\`\`\`markdown
- Bulleted item
- Another item
  - Nested item

1. Numbered item
2. Second item
\`\`\`

## Task lists

- [x] Done
- [ ] To do

## Links & images

\`\`\`markdown
[Link text](https://example.com)
![Alt text](image.png)
\`\`\`

## Blockquote

> The best tool is one that makes itself invisible.

## Code block

\`\`\`js
function render(md) {
  return parse(md)
}
\`\`\`

## Table

| Feature | Supported |
|---------|:---------:|
| Tables  | Yes       |
| Anchors | Yes       |

---

Open your own \`.md\` file any time from the sidebar.
`
