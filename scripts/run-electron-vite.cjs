const { spawn } = require('node:child_process')
const path = require('node:path')

const [, , command, ...args] = process.argv

if (!command) {
  console.error('Missing electron-vite command.')
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const electronViteRoot = path.dirname(require.resolve('electron-vite/package.json'))
const electronViteCli = path.join(electronViteRoot, 'dist', 'cli.js')

const child = spawn(
  process.execPath,
  [electronViteCli, command, ...args],
  {
    stdio: 'inherit',
    env,
    shell: false
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
