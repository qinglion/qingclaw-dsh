/** Cold-start launcher preserves workspace paths without evaluating shell syntax. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { createDevelopmentAppIcon, developmentLauncher } from '../scripts/development-app.ts'

it('creates a branded multi-resolution icon for the macOS development bundle', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-development-app-icon-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const source = join(root, 'icon-macos.png')
  const bundle = join(root, 'QingClaw Dev.app')
  mkdirSync(join(bundle, 'Contents', 'Resources'), { recursive: true })
  writeFileSync(source, 'brand icon')
  const calls: Array<{ executable: string; args: readonly string[] }> = []
  const icon = createDevelopmentAppIcon(source, bundle, (executable, args) => {
    calls.push({ executable, args })
    const output = executable === '/usr/bin/sips' ? args.at(-1) : args[3]
    if (output === undefined) throw new Error('icon command has no output')
    writeFileSync(output, executable === '/usr/bin/sips' ? 'png' : 'icns')
  })

  expect(icon).toBe('QingClaw.icns')
  expect(readFileSync(join(bundle, 'Contents', 'Resources', icon), 'utf8')).toBe('icns')
  const resizeCalls = calls.filter(call => call.executable === '/usr/bin/sips')
  expect(resizeCalls).toHaveLength(10)
  expect(resizeCalls.map(call => call.args[1])).toEqual(['16', '32', '32', '64', '128', '256', '256', '512', '512', '1024'])
  expect(resizeCalls.every(call => call.args[3] === source)).toBe(true)
  const iconutil = calls.at(-1)
  expect(iconutil?.executable).toBe('/usr/bin/iconutil')
  expect(iconutil?.args.slice(0, 4)).toEqual(['--convert', 'icns', '--output', join(bundle, 'Contents', 'Resources', icon)])
  expect(existsSync(dirname(iconutil!.args[4]!))).toBe(false)
})

it.skipIf(process.platform === 'win32')('passes literal workspace paths and cold-start settings to Electron', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-development-app-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const bundle = join(root, "Harness ' $(false).app")
  const binary = join(bundle, 'Contents', 'MacOS', 'Electron')
  mkdirSync(join(bundle, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(binary, '#!/bin/sh\nprintf "%s\\n" "$DSH_HOME" "$DSH_DESKTOP_DEV_APP" "$DSH_DESKTOP_OPEN_DEVTOOLS" "$DSH_DESKTOP_PRIMARY_RUNTIME_DIR" "$QINGCLAW_PLATFORM_ORIGIN" "$QINGCLAW_INFERENCE_ORIGIN" "$@"\n', { mode: 0o755 })
  const launcher = join(root, 'launcher')
  const home = join(root, "home ' $(false)")
  const primaryRuntime = join(root, "runtime ' $(false)")
  writeFileSync(launcher, developmentLauncher({ electron: binary, appRoot: root, directory: root,
    home, userData: join(root, 'browser data'), mainPort: 9229, rendererPort: 9222, hostPort: 9230, openDevtools: '0',
    primaryRuntime, platformOrigin: "https://beta.example.com/'$(false)", inferenceOrigin: 'https://api.example.com' }, bundle))
  const result = execFileSync('/bin/sh', [launcher, '--test-launch-argument'], { encoding: 'utf8' })
  expect(result.trimEnd().split('\n')).toEqual([home, '1', '0', primaryRuntime, "https://beta.example.com/'$(false)", 'https://api.example.com', '--inspect=127.0.0.1:9229',
    '--remote-debugging-port=9222', `--user-data-dir=${join(root, 'browser data')}`, root, '--test-launch-argument'])
})
