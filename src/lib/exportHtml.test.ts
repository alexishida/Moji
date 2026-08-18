import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml, type ExportTypography } from './exportHtml'

const typography: ExportTypography = { fontFamily: 'Inter', fontSize: 16, lineHeight: 1.7 }

const build = (
  body = '<p>content</p>',
  title = 'Report',
  overrides: Partial<ExportTypography> = {}
): string => buildStandaloneHtml(body, 'light', title, { ...typography, ...overrides })

/** Everything between the single `<style>` tag the document carries. */
function styleBlock(html: string): string {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
}

/**
 * Only the `.markdown-body` rule generated from the typography settings. The inlined stylesheets
 * legitimately contain declarations like `display: none`, so assertions about injection have to
 * look at the generated rule alone.
 */
function typographyRule(html: string): string {
  return styleBlock(html).match(/\.markdown-body \{\s*font-family:[\s\S]*?\}/)?.[0] ?? ''
}

describe('buildStandaloneHtml', () => {
  it('produces a complete document carrying the body inside .markdown-body', () => {
    const html = build('<h1>Title</h1><p>Body</p>')

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8" />')
    expect(html).toContain('<article class="markdown-body">\n<h1>Title</h1><p>Body</p>\n</article>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('applies the requested reading theme', () => {
    expect(build()).toContain('<html data-md-theme="light"')
    expect(buildStandaloneHtml('<p>x</p>', 'dark', 'T', typography)).toContain('<html data-md-theme="dark"')
  })

  it('is self-contained: every stylesheet is inlined and nothing is fetched', () => {
    const html = build()
    const styles = styleBlock(html)

    expect(html.match(/<style>/g)).toHaveLength(1)
    expect(styles).toContain('--katex-fonts-stub') // virtual:katex-fonts-css
    expect(styles).toContain('.markdown-body') // markdown.css + the print rules
    expect(styles.length).toBeGreaterThan(1_000) // theme.css tokens really travelled
    expect(html).not.toMatch(/<link\b/)
    expect(html).not.toMatch(/<script\b/)
  })

  it('carries the print rules the PDF and PNG exports depend on', () => {
    const styles = styleBlock(build())

    expect(styles).toContain('@page')
    expect(styles).toContain('@media print')
    // Long code lines must wrap instead of being cut off horizontally.
    expect(styles).toContain('html.export-png pre')
    expect(styles).toContain('white-space: pre-wrap')
  })

  describe('title', () => {
    it('places the document title in the head', () => {
      expect(build('<p>x</p>', 'Quarterly Report')).toContain('<title>Quarterly Report</title>')
    })

    it('escapes markup so a file name cannot inject nodes into the export', () => {
      const html = build('<p>x</p>', '<script>alert(1)</script> & "quoted"')

      expect(html).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "quoted"</title>')
      expect(html).not.toContain('<script>alert(1)')
    })
  })

  describe('typography', () => {
    it('writes the preview font, size and line height into the generated rule', () => {
      const rule = typographyRule(build('<p>x</p>', 'T', { fontFamily: 'Fira Sans', fontSize: 20, lineHeight: 1.4 }))

      expect(rule).toContain('font-family: Fira Sans, var(--font-sans)')
      expect(rule).toContain('font-size: 20px')
      expect(rule).toContain('line-height: 1.4')
    })

    it('strips characters that would let a hand-edited settings.json escape the rule', () => {
      // A font family reaches here straight from settings.json, so it is treated as untrusted CSS.
      const rule = typographyRule(build('<p>x</p>', 'T', { fontFamily: 'Inter; } body { display: none } .x {' }))

      // Braces, semicolons, colons and dots are gone, so the value cannot end the declaration.
      expect(rule).toContain('font-family: Inter  body  display none  x, var(--font-sans)')
      expect(rule).not.toContain('display: none')
      expect(rule).not.toMatch(/font-family:[^;]*[{}]/)
    })

    it('keeps a legitimate quoted, multi-family stack intact', () => {
      const rule = typographyRule(build('<p>x</p>', 'T', { fontFamily: `"JetBrains Mono", 'Fira Code', sans-serif` }))

      expect(rule).toContain(`font-family: "JetBrains Mono", 'Fira Code', sans-serif, var(--font-sans)`)
    })

    it('falls back to Inter when nothing usable survives sanitizing', () => {
      expect(typographyRule(build('<p>x</p>', 'T', { fontFamily: '@#$%^&*()' })))
        .toContain('font-family: Inter, var(--font-sans)')
    })
  })
})
