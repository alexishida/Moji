const { spawn } = require('node:child_process')
const path = require('node:path')

const [, , command, ...args] = process.argv
const mockUpdateFlag = '--mock-update'

if (!command) {
  console.error('Missing electron-vite command.')
  process.exit(1)
}

const mockUpdate = args.includes(mockUpdateFlag)
if (mockUpdate && command !== 'dev') {
  console.error(`${mockUpdateFlag} is only supported with the dev command.`)
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (mockUpdate) env.MOJI_MOCK_UPDATE = '1'

const electronViteArgs = args.filter((arg) => arg !== mockUpdateFlag)

const electronViteRoot = path.dirname(require.resolve('electron-vite/package.json'))
const electronViteCli = path.join(electronViteRoot, 'dist', 'cli.js')

const child = spawn(
  process.execPath,
  [electronViteCli, command, ...electronViteArgs],
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
