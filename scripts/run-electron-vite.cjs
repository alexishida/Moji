const { spawn, spawnSync } = require('node:child_process')
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

// Electron 42+ does not download its binary from its own postinstall hook. Our
// project postinstall handles a normal `npm install`, but ensure `dev` and
// `preview` can repair an interrupted or scripts-disabled install as well.
if (command === 'dev' || command === 'preview') {
  const installer = path.join(__dirname, 'install-electron-binary.cjs')
  const install = spawnSync(process.execPath, [installer], { stdio: 'inherit', env, shell: false })
  if (install.error) throw install.error
  if (install.status !== 0) process.exit(install.status ?? 1)
}

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
