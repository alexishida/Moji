import { cpus, platform, release, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'
import { exportDocumentToPath } from './export'
import type { PerformanceReport } from './shared'

const wait = (ms: number) => new Promise<void>((resolveWait) => setTimeout(resolveWait, ms))

/** Progress goes to stdout so a run that stalls shows which step it stalled on. */
const step = (message: string): void => console.log(`[benchmark] ${message}`)

/** Comfortably longer than the renderer's autosave debounce, so a tick is guaranteed to fire. */
const AUTOSAVE_SETTLE_MS = 1_500

function arg(name: string): string | null {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
}

export function benchmarkRequested(): boolean {
  return arg('--benchmark-output') !== null
}

async function rendererReport(win: BrowserWindow): Promise<{ renderer: PerformanceReport; main: PerformanceReport }> {
  return await win.webContents.executeJavaScript('window.__mojiPerformance.getReport()')
}

async function rendererReportSince(
  win: BrowserWindow,
  startedAt: number
): Promise<{ renderer: PerformanceReport; main: PerformanceReport }> {
  const report = await rendererReport(win)
  return {
    renderer: { metrics: report.renderer.metrics.filter((metric) => metric.timestamp >= startedAt) },
    main: { metrics: report.main.metrics.filter((metric) => metric.timestamp >= startedAt) }
  }
}

/**
 * Opening only pushes metadata; the renderer then streams the bytes. Scenarios share one window, so
 * waiting must key on the expected file becoming the active tab — any weaker gate passes immediately
 * on the document left over from the previous scenario.
 */
async function waitForActiveDocument(win: BrowserWindow, fileName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const expected = JSON.stringify(fileName)
  while (Date.now() < deadline) {
    const ready = await win.webContents.executeJavaScript(
      `document.querySelector('.document-tab--active .document-tab__title')?.textContent?.trim() === ${expected}`
    )
    if (ready) return
    await wait(50)
  }
  throw new Error(`Document ${fileName} did not become active within ${timeoutMs} ms`)
}

async function waitForPreviewHeading(
  win: BrowserWindow,
  expectedHeading: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const expected = JSON.stringify(expectedHeading)
  while (Date.now() < deadline) {
    const ready = await win.webContents.executeJavaScript(
      `document.querySelector('.markdown-body h1')?.textContent?.trim() === ${expected}`
    )
    if (ready) {
      await win.webContents.executeJavaScript(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      )
      return
    }
    await wait(100)
  }
  throw new Error(`Preview did not render expected heading within ${timeoutMs} ms`)
}

/** Local, opt-in benchmark. Output contains metrics and machine metadata, never document contents or paths. */
export async function recordBenchmark(win: BrowserWindow, open: (path: string) => Promise<void>): Promise<void> {
  const output = arg('--benchmark-output')
  const corpus = arg('--benchmark-corpus')
  if (!output || !corpus) throw new Error('--benchmark-output and --benchmark-corpus are required')
  const scenarios = [
    ['plain-1mb', 'plain-1mb.md', 3_000, 'Plain benchmark'],
    ['rich-5mb', 'rich-5mb.md', 8_000, 'Markdown performance corpus'],
    ['layout-tables', 'layout-tables.md', 8_000, 'Table layout benchmark'],
    ['layout-images', 'layout-images.md', 8_000, 'Image layout benchmark'],
    ['layout-code', 'layout-code.md', 8_000, 'Code layout benchmark'],
    ['layout-formulas', 'layout-formulas.md', 15_000, 'Formula layout benchmark'],
    ['short-lines-20mb', 'short-lines-20mb.md', 15_000, 'Many short lines'],
    ['long-lines-50mb', 'long-lines-50mb.md', 30_000, 'Long-line benchmark']
  ] as const
  const results: Record<string, { renderer: PerformanceReport; main: PerformanceReport }> = {}
  await wait(500)
  for (const [name, file, timeoutMs, expectedHeading] of scenarios) {
    const startedAt = Date.now()
    step(`${name}: opening`)
    await open(resolve(corpus, file))
    await waitForActiveDocument(win, file, timeoutMs)
    step(`${name}: active`)
    if (name === 'long-lines-50mb') {
      await win.webContents.executeJavaScript("document.querySelectorAll('.segment__btn')[0]?.click()")
    }
    if (expectedHeading) await waitForPreviewHeading(win, expectedHeading, timeoutMs)
    else await wait(timeoutMs)
    await wait(500)
    results[`${name}/open-preview`] = await rendererReportSince(win, startedAt)
    step(`${name}: recorded`)
  }

  const typingStartedAt = Date.now()
  step('typing: starting')
  await win.webContents.executeJavaScript("document.querySelectorAll('.segment__btn')[1]?.click()")
  await wait(400)
  for (let index = 0; index < 100; index += 1) win.webContents.insertText('x')
  await wait(600)
  results['long-lines-50mb/typing'] = await rendererReportSince(win, typingStartedAt)
  step('typing: recorded')

  // Draft autosave: the first tick writes a snapshot, later ticks must only append to the journal.
  const draftStartedAt = Date.now()
  step('draft autosave: starting')
  await win.webContents.executeJavaScript(
    "[...document.querySelectorAll('.filegroup__btn')].find((b) => b.title?.length)?.click()"
  )
  await wait(400)
  // insertText targets the focused element, which is still the button that was just clicked.
  await win.webContents.executeJavaScript("document.querySelector('.cm-content')?.focus()")
  await wait(200)
  for (let index = 0; index < 40; index += 1) win.webContents.insertText('a')
  await wait(AUTOSAVE_SETTLE_MS)
  for (let index = 0; index < 40; index += 1) win.webContents.insertText('b')
  await wait(AUTOSAVE_SETTLE_MS)
  results['draft/autosave'] = await rendererReportSince(win, draftStartedAt)
  step('draft autosave: recorded')

  await open(resolve(corpus, 'rich-5mb.md'))
  await waitForActiveDocument(win, 'rich-5mb.md', 8_000)
  await waitForPreviewHeading(win, 'Markdown performance corpus', 8_000)
  await wait(300)
  step('exports: collecting html')
  const rich = results['rich-5mb/open-preview']
  const html = await win.webContents.executeJavaScript(`(async () => {
    const body = document.querySelector('.markdown-body')?.innerHTML ?? ''
    return '<!doctype html><html><body><article class="markdown-body">' + body + '</article></body></html>'
  })()`)
  const exportDirectory = join(resolve(corpus, '..'), 'benchmark-exports')
  await mkdir(exportDirectory, { recursive: true })
  for (const format of ['html', 'pdf', 'png'] as const) {
    const exportStartedAt = Date.now()
    step(`export ${format}: starting`)
    await exportDocumentToPath({ format, pageSize: 'A4', pageOrientation: 'portrait', html, baseName: 'benchmark' }, join(exportDirectory, `benchmark.${format}`))
    results[`rich-5mb/export-${format}`] = await rendererReportSince(win, exportStartedAt)
    step(`export ${format}: done`)
  }
  step('writing output')
  await writeFile(resolve(output), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), environment: { platform: platform(), release: release(), cpu: cpus()[0]?.model ?? 'unknown', cpuCores: cpus().length, memoryBytes: totalmem(), electron: process.versions.electron, appVersion: process.env['npm_package_version'] ?? 'unknown' }, scenarios: results, referenceScenario: rich ? 'rich-5mb/open-preview' : null }, null, 2)}\n`)
}
