import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  configureQingClawDesktopDataIsolation,
  type QingClawDesktopPathApp,
} from '../src/qingclaw-data-isolation.ts'
import { resolveDesktopPaths } from '../src/paths.ts'

function directorySnapshot(directory: string): Record<string, string> {
  const snapshot: Record<string, string> = {}
  const visit = (current: string, relative: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const child = relative === '' ? name : join(relative, name)
      try {
        snapshot[`${child}/`] = ''
        visit(path, child)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error
        delete snapshot[`${child}/`]
        snapshot[child] = readFileSync(path, 'utf8')
      }
    }
  }
  visit(directory, '')
  return snapshot
}

function fakeApp(options: {
  readonly packaged: boolean
  readonly appData: string
  readonly userData?: string
}): { readonly app: QingClawDesktopPathApp; readonly assigned: Map<string, string> } {
  const assigned = new Map<string, string>()
  const app: QingClawDesktopPathApp = {
    isPackaged: options.packaged,
    getPath: name => name === 'appData' ? options.appData : options.userData ?? join(options.appData, 'development-user-data'),
    setPath: (name, path) => { assigned.set(name, path) },
  }
  return { app, assigned }
}

afterEach(() => {
  vi.doUnmock('electron')
  vi.doUnmock('../src/main.ts')
})

describe('QingClaw Desktop data isolation', () => {
  it.skipIf(process.platform === 'win32')('does not read, write, or delete a pre-existing official ~/.dsh', () => {
    const root = mkdtempSync(join(tmpdir(), 'qingclaw-data-isolation-'))
    onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
    const officialHome = join(root, 'home', '.dsh')
    mkdirSync(join(officialHome, 'profiles', 'desktop'), { recursive: true })
    writeFileSync(join(officialHome, 'credentials.yaml'), 'official-login: keep\n')
    writeFileSync(join(officialHome, 'profiles', 'desktop', 'cordis.yml'), 'official-profile: keep\n')
    const before = directorySnapshot(officialHome)
    const appData = join(root, 'application-data')
    const { app, assigned } = fakeApp({ packaged: true, appData })
    const environment: NodeJS.ProcessEnv = { HOME: join(root, 'home'), DSH_HOME: officialHome }

    let paths
    chmodSync(officialHome, 0o000)
    try {
      // Permission denial turns any attempted official-directory read into a test failure.
      paths = configureQingClawDesktopDataIsolation(app, environment)
    } finally {
      chmodSync(officialHome, 0o700)
    }

    const userData = join(appData, 'QingClaw')
    expect(paths).toEqual({ userData, dshHome: join(userData, 'dsh-home') })
    expect(environment.DSH_HOME).toBe(join(userData, 'dsh-home'))
    expect(assigned).toEqual(new Map([['userData', userData], ['sessionData', userData]]))
    expect(directorySnapshot(officialHome)).toEqual(before)
  })

  it('derives unpackaged Harness state below its explicit QingClaw userData', () => {
    const userData = '/development/qingclaw-electron'
    const { app, assigned } = fakeApp({ packaged: false, appData: '/unused', userData })
    const environment: NodeJS.ProcessEnv = { DSH_HOME: '/official/.dsh' }

    expect(configureQingClawDesktopDataIsolation(app, environment)).toEqual({
      userData,
      dshHome: join(userData, 'dsh-home'),
    })
    expect(environment.DSH_HOME).toBe(join(userData, 'dsh-home'))
    expect(assigned.get('userData')).toBe(userData)
  })

  it('retains the update qualification bootstrap only when its complete isolated shape matches', () => {
    const root = join('/application-data', 'dsh-update-qualification', 'a'.repeat(24))
    const userData = join(root, 'user-data')
    const { app } = fakeApp({ packaged: true, appData: '/unused', userData })
    const environment: NodeJS.ProcessEnv = {
      DSH_HOME: join(root, 'dsh-home'),
      DSH_DESKTOP_UPDATE_JOURNAL_DIR: join(root, 'journals'),
    }

    expect(configureQingClawDesktopDataIsolation(app, environment)).toEqual({
      userData,
      dshHome: join(root, 'dsh-home'),
    })
  })

  it('uses a QingClaw-specific profile name', () => {
    expect(resolveDesktopPaths('/qingclaw/dsh-home')).toEqual({
      profile: join('/qingclaw/dsh-home', 'profiles', 'qingclaw-desktop'),
      lock: join('/qingclaw/dsh-home', 'profiles', 'qingclaw-desktop', 'lock'),
    })
  })

  it('configures isolation before evaluating the Desktop runtime module', async () => {
    vi.resetModules()
    const appData = '/application-data'
    const { app, assigned } = fakeApp({ packaged: true, appData })
    const previousHome = process.env.DSH_HOME
    let observed: { readonly home: string | undefined; readonly userData: string | undefined } | undefined
    vi.doMock('electron', () => ({ app: { ...app, exit: vi.fn() } }))
    vi.doMock('../src/main.ts', () => {
      observed = { home: process.env.DSH_HOME, userData: assigned.get('userData') }
      return {}
    })
    process.env.DSH_HOME = '/official/.dsh'

    try {
      await import('../src/qingclaw-main.ts')
      await vi.waitFor(() => { expect(observed).toBeDefined() })
      expect(observed).toEqual({
        home: join(appData, 'QingClaw', 'dsh-home'),
        userData: join(appData, 'QingClaw'),
      })
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    }
  })
})
