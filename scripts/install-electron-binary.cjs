// Electron dropped its own `postinstall` binary download in 42.0.0, so a plain
// `npm install` leaves node_modules/electron without a dist/ and `npm run dev`
// fails with "Error: Electron uninstall". Run the installer Electron still ships.
// It exits early when the binary is already in place, so repeat installs are free.

const { spawn } = require('node:child_process')

let installer
try {
  installer = require.resolve('electron/install.js')
} catch {
  // Installs that omit devDependencies have no Electron to set up.
  process.exit(0)
}

const env = { ...process.env }
// install.js resolves its own paths; inheriting our Electron context confuses it.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [installer], {
  stdio: 'inherit',
  env,
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
