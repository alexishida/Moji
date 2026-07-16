// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { documentAssetBaseUrl, findMarkdownHeadingLine, renderMarkdown } from './markdown'

describe('documentAssetBaseUrl', () => {
  it('converts Windows paths to an encoded file URL', () => {
    expect(documentAssetBaseUrl('C:\\notes\\My file.md')).toBe('file:///C:/notes/')
  })

  it('returns null when document has no parent path', () => {
    expect(documentAssetBaseUrl('README.md')).toBeNull()
  })

  it('converts UNC paths to a network file URL', () => {
    expect(documentAssetBaseUrl('\\\\server\\share\\guide.md')).toBe('file://server/share/')
  })
})

describe('renderMarkdown', () => {
  it('sanitizes unsafe markup while keeping external links safe', () => {
    const html = renderMarkdown('[site](https://example.com) <script>alert(1)</script>')

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('<script')
  })

  it('resolves local images for file exports', () => {
    const html = renderMarkdown('![Logo](images/logo%20file.png)', {
      documentPath: 'C:\\notes\\guide.md',
      assetMode: 'file'
    })

    expect(html).toContain('src="file:///C:/notes/images/logo%20file.png"')
  })

  it('maps local images to app API data attributes in preview mode', () => {
    const html = renderMarkdown('![Logo](images/logo.png)', {
      documentPath: 'C:\\notes\\guide.md',
      assetMode: 'app'
    })

    expect(html).toContain('data-local-src="C:/notes/images/logo.png"')
    expect(html).toContain('src="data:image/gif;base64,')
  })

  it('removes unsafe URL schemes from rendered links', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">bad</a>')

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href=')
  })

  it('renders Markdown extensions and removes a leading byte-order mark', () => {
    const html = renderMarkdown('\uFEFF- [x] done\n\n==highlight== and ^up^')

    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<mark>highlight</mark>')
    expect(html).toContain('<sup>up</sup>')
  })

  it('marks Mermaid fences as escaped diagram candidates', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  Start --> End\n```')

    expect(html).toContain('<pre class="hljs mermaid-diagram-candidate">')
    expect(html).toContain('<code>flowchart TD')
  })
})

describe('findMarkdownHeadingLine', () => {
  it('locates an anchored heading in Markdown source', () => {
    expect(findMarkdownHeadingLine('# Intro\n\n## Next section', 'next-section')).toBe(2)
  })

  it('distinguishes repeated heading IDs', () => {
    expect(findMarkdownHeadingLine('# Same\n\n# Same', 'same-1')).toBe(2)
  })

  it('returns null when no matching heading exists', () => {
    expect(findMarkdownHeadingLine('# Intro', 'missing')).toBeNull()
  })
})
