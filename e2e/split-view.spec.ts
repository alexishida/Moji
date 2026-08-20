import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, VIEW_MODE, type LaunchedApp } from './fixtures'

let launched: LaunchedApp | null = null
let workspace = ''

/** Long enough for every heading to reach the top of either pane. */
const DOCUMENT = [
  '# First section',
  '',
  'Opening paragraph.',
  '',
  ...Array.from({ length: 40 }, (_, i) => `First filler ${i + 1}.`),
  '',
  '## Second section',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Second filler ${i + 1}.`),
  '',
  '## Third section',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Third filler ${i + 1}.`),
  ''
].join('\n')

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'moji-e2e-split-'))
})

test.afterEach(async () => {
  await launched?.close()
  launched = null
})

test.afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

test('shows the preview beside the editor and follows what is being edited', async () => {
  const documentPath = join(workspace, 'split.md')
  await writeFile(documentPath, DOCUMENT, 'utf-8')

  launched = await launchApp([documentPath])
  const window = launched.window
  await window.getByRole('tab').nth(VIEW_MODE.editor).click()
  await expect(window.locator('.markdown-body')).toHaveCount(0)

  await window.keyboard.press('Control+Backslash')

  // Both panes are live, and the preview renders the document being edited.
  await expect(window.locator('.split--active')).toBeVisible()
  await expect(window.locator('.cm-content')).toBeVisible()
  await expect(window.locator('.markdown-body h1')).toHaveText('First section')

  // Typing at the end of the document pulls the preview down with it.
  await window.locator('.cm-content').click()
  await window.keyboard.press('Control+End')
  await window.keyboard.type('\n\nTail edit.')

  await expect(window.locator('.markdown-body')).toContainText('Tail edit.')
  await expect
    .poll(async () => window.locator('.split__pane--preview .pane').evaluate((pane) => pane.scrollTop))
    .toBeGreaterThan(0)

  // Leaving the edit unsaved would make teardown hit the save-or-discard prompt.
  await window.keyboard.press('Control+S')
  await expect(window.locator('.document-tab__dirty')).toHaveText('')
})

test('sends an outline pick to the top of both panes', async () => {
  const documentPath = join(workspace, 'outline.md')
  await writeFile(documentPath, DOCUMENT, 'utf-8')

  launched = await launchApp([documentPath])
  const window = launched.window
  await window.getByRole('tab').nth(VIEW_MODE.editor).click()
  await window.keyboard.press('Control+Backslash')
  await expect(window.locator('.split--active')).toBeVisible()

  await window.locator('.sidebar').getByText('Second section', { exact: true }).click()

  // Centring the heading in the editor would leave the preview showing the section above it.
  await expect
    .poll(async () => window.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement
      const rect = scroller.getBoundingClientRect()
      return document.elementFromPoint(rect.left + 60, rect.top + 8)?.textContent ?? ''
    }))
    .toContain('Second section')

  await expect
    .poll(async () => window.evaluate(() => {
      const pane = document.querySelector('.split__pane--preview .pane') as HTMLElement
      const heading = Array.from(pane.querySelectorAll('h2')).find((h) => h.textContent === 'Second section')
      if (!heading) return Number.NaN
      return Math.abs(heading.getBoundingClientRect().top - pane.getBoundingClientRect().top)
    }))
    .toBeLessThan(48)
})

test('resizes the panes from the divider', async () => {
  const documentPath = join(workspace, 'resizable.md')
  await writeFile(documentPath, DOCUMENT, 'utf-8')

  launched = await launchApp([documentPath])
  const window = launched.window
  await window.getByRole('tab').nth(VIEW_MODE.editor).click()
  await window.keyboard.press('Control+Backslash')
  await expect(window.locator('.split--active')).toBeVisible()

  const divider = window.locator('.split__divider')
  await expect(divider).toHaveAttribute('aria-valuenow', '50')

  await divider.focus()
  await window.keyboard.press('ArrowLeft')
  await expect(divider).toHaveAttribute('aria-valuenow', '48')

  await divider.dblclick()
  await expect(divider).toHaveAttribute('aria-valuenow', '50')

  // Turning the split off leaves the editor alone on screen, with its text untouched.
  await window.keyboard.press('Control+Backslash')
  await expect(window.locator('.markdown-body')).toHaveCount(0)
  await expect(window.locator('.cm-content')).toContainText('First section')
})
