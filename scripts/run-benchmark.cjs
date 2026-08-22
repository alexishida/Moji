// @ts-check

const { spawn } = require('node:child_process')
const { resolve } = require('node:path')

const electron = require('electron')
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(electron, [resolve(process.cwd()), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: environment,
  shell: false
})

child.on('error', (error) => {
  console.error('Could not start Electron benchmark:', error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => process.exitCode = signal ? 1 : (code ?? 1))
