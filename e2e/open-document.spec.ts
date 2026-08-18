import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, VIEW_MODE, type LaunchedApp } from './fixtures'

let launched: LaunchedApp | null = null
let workspace = ''

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'moji-e2e-docs-'))
})

test.afterEach(async () => {
  await launched?.close()
  launched = null
})

test.afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

test('starts with the welcome screen when given no file', async () => {
  launched = await launchApp()

  await expect(launched.window.locator('.markdown-body')).toHaveCount(0)
  expect(await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('opens a document passed on the command line and renders it', async () => {
  const documentPath = join(workspace, 'from-cli.md')
  await writeFile(documentPath, '# From the command line\n\nBody text.\n', 'utf-8')

  launched = await launchApp([documentPath])

  // The command line is one of the four entry points the plan calls out, and the only one
  // that can be driven without a native dialog.
  await expect(launched.window.locator('.markdown-body h1')).toHaveText('From the command line')
  await expect(launched.window.locator('.markdown-body')).toContainText('Body text.')
})

test('switches into the editor and shows the source text', async () => {
  const documentPath = join(workspace, 'editable.md')
  await writeFile(documentPath, '# Editable\n\nOriginal body.\n', 'utf-8')

  launched = await launchApp([documentPath])
  await expect(launched.window.locator('.markdown-body h1')).toHaveText('Editable')

  await launched.window.getByRole('tab').nth(VIEW_MODE.editor).click()

  await expect(launched.window.locator('.cm-content')).toContainText('Original body.')
  // Editor mode unmounts the preview entirely; this is PERF-101 observed in the real app.
  await expect(launched.window.locator('.markdown-body')).toHaveCount(0)
})

test('types into the editor and keeps the text', async () => {
  const documentPath = join(workspace, 'typing.md')
  await writeFile(documentPath, '# Typing\n', 'utf-8')

  launched = await launchApp([documentPath])
  await launched.window.getByRole('tab').nth(VIEW_MODE.editor).click()
  await launched.window.locator('.cm-content').click()
  await launched.window.keyboard.type(' edited')

  await expect(launched.window.locator('.cm-content')).toContainText('edited')
})

test('asks before closing a document with unsaved changes', async () => {
  const documentPath = join(workspace, 'unsaved.md')
  await writeFile(documentPath, '# Unsaved\n', 'utf-8')

  launched = await launchApp([documentPath])
  await launched.window.getByRole('tab').nth(VIEW_MODE.editor).click()
  await launched.window.locator('.cm-content').click()
  await launched.window.keyboard.type(' changed')

  // Closing must not discard the edit silently; the window stays open behind the prompt.
  void launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())

  await expect(launched.window.locator('.dialog, [role="dialog"]')).toBeVisible()
  expect(await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
