import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The two view-mode buttons, by position rather than by label.
 *
 * The app picks its language from the OS locale, so the visible text is whatever the
 * machine running the suite speaks. Position is stable across all six translations.
 */
export const VIEW_MODE = { preview: 0, editor: 1 } as const

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  /** Throwaway `userData`, so drafts and settings never touch the real profile. */
  userDataDirectory: string
  close: () => Promise<void>
}

/**
 * Launch the built app with an isolated profile.
 *
 * `--user-data-dir` matters more than it looks: without it a test would read and overwrite
 * the drafts and settings of whoever is running it, and results would depend on the state
 * that machine happened to be in.
 */
export async function launchApp(extraArgs: string[] = []): Promise<LaunchedApp> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'moji-e2e-'))
  // The switch has to precede the app path: Electron reads what comes before it as
  // Chromium switches and hands the rest to the application. Placed after, it was passed
  // through as an argument and the tests silently ran against the real user profile.
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, 'out/main/main.js', ...extraArgs]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return {
    app,
    window,
    userDataDirectory,
    close: async () => {
      // A document with unsaved changes makes the app ask before closing, which is correct
      // behaviour and would otherwise hang teardown forever. Tests that want to observe
      // that prompt do so explicitly; here the window is taken down either way.
      try {
        await Promise.race([
          app.close(),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('close timed out')), 5000))
        ])
      } catch {
        app.process().kill('SIGKILL')
      }
      await rm(userDataDirectory, { recursive: true, force: true })
    }
  }
}
