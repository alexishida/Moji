#!/usr/bin/env node
/*
 * Rebuild first: npm run build
 * Run: node docs/capture-readme-screenshots.cjs
 *
 * Requires Playwright with Chromium installed. The script launches Electron,
 * opens samples/markdown-guide.en.md, and writes the README screenshots in docs/.
 * Native Windows capture is deliberate: Playwright page screenshots omit title-bar
 * controls, while this preserves minimize, maximize, and close buttons.
 */

const { existsSync, readFileSync } = require('node:fs')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const main = path.join(root, 'out', 'main', 'main.js')
const guide = path.join(root, 'samples', 'markdown-guide.en.md')
const debugPort = 9223

if (!existsSync(electron) || !existsSync(main)) {
  throw new Error('Electron build missing. Run `npm run build` first.')
}

function capture(processId, file) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'capture-window.ps1'),
      '-ProcessId',
      String(processId),
      '-OutputPath',
      path.join(__dirname, file)
    ],
    { stdio: 'inherit' }
  )
}

async function connect() {
  let lastError
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError
}

;(async () => {
  const app = spawn(electron, [`--remote-debugging-port=${debugPort}`, main, guide], {
    cwd: root,
    detached: false,
    stdio: 'ignore'
  })

  try {
    const browser = await connect()
    const page = browser.contexts()[0].pages().find((candidate) => candidate.url() !== 'about:blank')
    if (!page) throw new Error('Moji renderer page not found.')

    await page.locator('.markdown-body').waitFor()
    await page.waitForTimeout(500)
    capture(app.pid, 'scr-main.jpg')

    // Bundled guides are read-only. New tab keeps editor screenshot faithful while
    // retaining the exact markdown-guide.en.md content.
    await page.locator('.filegroup__btn').first().click()
    await page.locator('.segment__btn').nth(1).click()
    await page.locator('.cm-editor').waitFor()
    await page.locator('.cm-content').fill(readFileSync(guide, 'utf8'))
    capture(app.pid, 'scr-edit.jpg')

    await page.locator('.document-tab').last().locator('.document-tab__close').click()
    await page.locator('.dialog-backdrop .btn').nth(1).click() // Discard unsaved copy.
    await page.locator('.segment__btn').first().click()
    await page.locator('.mermaid-diagram').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    capture(app.pid, 'scr-mermaid.jpg')

    await page.locator('.mermaid-diagram').first().click()
    await page.locator('.diagram-modal').waitFor()
    capture(app.pid, 'scr-mermaid-dialog.jpg')

    await page.locator('.diagram-modal__close').click()
    await page.locator('.segment__btn').nth(2).click()
    await page.locator('.export-dialog').waitFor()
    capture(app.pid, 'scr-export.jpg')

    await page.locator('.export-dialog .iconbtn').click()
    await page.locator('.document-tab__close').click()
    await page.locator('.welcome').waitFor()
    capture(app.pid, 'scr-welcome.jpg')

    await browser.close()
  } finally {
    app.kill()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
