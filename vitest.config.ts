import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
  // React is needed to compile the `.tsx` component tests.
  plugins: [react(), katexFontsCssStub()],
  test: {
    // Node by default; component tests opt into a DOM with `@vitest-environment jsdom`
    // at the top of the file, which is how Vitest 4 selects an environment per file.
    environment: 'node',
    // `exportHtml` inlines real stylesheets with `?inline`; without this they arrive empty.
    css: true,
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts', 'scripts/**/*.test.ts']
  }
})
