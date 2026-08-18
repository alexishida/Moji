import { defineConfig, type Plugin } from 'vitest/config'

/**
 * `virtual:katex-fonts-css` is assembled from KaTeX's dist by `electron.vite.config.ts`, where it
 * carries every woff2 face inlined as base64. Tests only need to observe that whatever the module
 * resolves to reaches the exported document, so it is stubbed with a marker rule instead of a
 * megabyte of fonts.
 */
function katexFontsCssStub(): Plugin {
  const virtualId = 'virtual:katex-fonts-css'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'katex-fonts-css-stub',
    resolveId: (id) => (id === virtualId ? resolvedId : null),
    load: (id) => (id === resolvedId ? 'export default ".katex{--katex-fonts-stub:1}"' : null)
  }
}

export default defineConfig({
  plugins: [katexFontsCssStub()],
  test: {
    environment: 'node',
    // `exportHtml` inlines real stylesheets with `?inline`; without this they arrive empty.
    css: true,
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts']
  }
})
