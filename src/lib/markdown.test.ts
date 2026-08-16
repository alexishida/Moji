// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  documentAssetBaseUrl,
  extractMarkdownOutline,
  hasPotentialMath,
  renderMarkdown,
  renderMarkdownAsync,
  renderMarkdownDocument,
  sanitizeMarkdownHtml
} from './markdown'
import { renderMarkdownDocumentRaw } from './markdownCore'

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

  it('sanitizes worker-shaped raw HTML before it reaches preview state', () => {
    const raw = renderMarkdownDocumentRaw('<img src="x" onerror="alert(1)"><script>alert(2)</script>')

    expect(raw.rawHtml).toContain('onerror=')
    const html = sanitizeMarkdownHtml(raw.rawHtml)
    expect(html).not.toContain('onerror=')
    expect(html).not.toContain('<script')
  })

  it('resolves local images for file exports', () => {
    const html = renderMarkdown('![Logo](images/logo%20file.png)', {
      documentPath: 'C:\\notes\\guide.md',
      assetMode: 'file'
    })

    expect(html).toContain('src="file:///C:/notes/images/logo%20file.png"')
  })

  it.each([
    ['UNC', '\\\\server\\share\\guide.md', 'file://server/share/images/logo.png'],
    ['Linux', '/home/alex/notes/guide.md', 'file:///home/alex/notes/images/logo.png'],
    ['macOS', '/Users/alex/notes/guide.md', 'file:///Users/alex/notes/images/logo.png']
  ])('resolves local images for %s paths during token rendering', (_platform, documentPath, expectedUrl) => {
    expect(renderMarkdown('![Logo](images/logo.png)', { documentPath, assetMode: 'file' })).toContain(
      `src="${expectedUrl}"`
    )
  })

  it('resolves local file links against the Markdown document directory', () => {
    const html = renderMarkdown('[report](docs/report.pdf)', {
      documentPath: 'C:\\notes\\guide.md',
      assetMode: 'app'
    })

    expect(html).toContain('href="file:///C:/notes/docs/report.pdf"')
  })

  it('maps local images to app asset protocol URLs in preview mode', () => {
    const html = renderMarkdown('![Logo](images/logo.png)', {
      documentPath: 'C:\\notes\\guide.md',
      assetMode: 'app'
    })

    expect(html).toContain('data-local-asset="moji-asset://local/C%3A%2Fnotes%2Fimages%2Flogo.png"')
    expect(html).toContain('src="data:image/gif;base64,')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
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

  it.each(['ts', 'bash', 'json'])('highlights supported %s fences', (language) => {
    const html = renderMarkdown(`\`\`\`${language}\nconst value = true\n\`\`\``)

    expect(html).toContain('hljs-')
  })

  it('falls back to escaped plain text for an unsupported fence', () => {
    const html = renderMarkdown('```unknown-language\n<tag>\n```')

    expect(html).toContain('&lt;tag&gt;')
    expect(html).not.toContain('hljs-')
  })

  it('loads KaTeX on demand for dollar-delimited math and keeps invalid TeX renderable', async () => {
    expect(hasPotentialMath('plain Markdown')).toBe(false)
    expect(hasPotentialMath('Price: $10')).toBe(true)

    await expect(renderMarkdownAsync('$x^2$')).resolves.toContain('class="katex"')
    await expect(renderMarkdownAsync('$\\invalid$')).resolves.toContain('\\invalid')
  })
})

describe('extractMarkdownOutline', () => {
  it('returns anchored headings without rendering preview HTML', () => {
    expect(extractMarkdownOutline('# Intro\n\n### Requirement: Keep data\n\n# Intro')).toEqual([
      { id: 'user-content-intro', text: 'Intro', level: 1, sourceLine: 0 },
      { id: 'user-content-requirement%3A-keep-data', text: 'Requirement: Keep data', level: 3, sourceLine: 2 },
      { id: 'user-content-intro-1', text: 'Intro', level: 1, sourceLine: 4 }
    ])
  })

  it('keeps unique anchor IDs shared by preview and outline', () => {
    const result = renderMarkdownDocument('# Same\n\n# Same')

    expect(result.outline.map((item) => item.id)).toEqual(['user-content-same', 'user-content-same-1'])
    expect(result.html).toContain('id="user-content-same"')
    expect(result.html).toContain('id="user-content-same-1"')
  })

  it('keeps a safe ID and internal link for DOM-clobbering heading names', () => {
    const result = renderMarkdownDocument('## Links\n\n[Go to links](#links)')

    expect(result.outline[0]?.id).toBe('user-content-links')
    expect(result.html).toContain('id="user-content-links"')
    expect(result.html).toContain('href="#user-content-links"')
  })

  it('splits virtual preview into sanitized top-level blocks with heading metadata', () => {
    const raw = renderMarkdownDocumentRaw('# First\n\nParagraph one.\n\n## Second\n\n```js\nalert(1)\n```', {
      blockMode: true
    })

    expect(raw.rawHtml).toBe('')
    expect(raw.blocks?.length).toBeGreaterThanOrEqual(2)
    expect(raw.blocks?.flatMap((block) => block.headingIds)).toEqual([
      'user-content-first',
      'user-content-second'
    ])
    expect(raw.blocks?.every((block) => block.estimatedHeight > 0)).toBe(true)

    const sanitized = renderMarkdownDocument('# Safe\n\n<img src="x" onerror="alert(1)">', {
      blockMode: true
    })
    expect(sanitized.html).toBe('')
    expect(sanitized.blocks?.map((block) => block.html).join('')).not.toContain('onerror')
  })
})
