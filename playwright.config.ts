import { defineConfig } from '@playwright/test'

/**
 * End-to-end suite: drives the packaged main process through a real Electron window.
 *
 * Kept out of `npm test` on purpose. It builds and launches the app, so it is measured in
 * seconds per case rather than milliseconds, and the unit suite must stay fast enough to
 * run on every change.
 */
export default defineConfig({
  testDir: 'e2e',
  // The app is a single window with one instance lock; parallel workers would fight over it.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' }
})
