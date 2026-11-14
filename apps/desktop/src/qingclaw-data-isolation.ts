/** QingClaw-owned Electron and Harness data paths established before Desktop runtime imports. */

import { basename, dirname, join } from 'node:path'

const QINGCLAW_USER_DATA_DIRECTORY = 'QingClaw'
const QINGCLAW_DSH_HOME_DIRECTORY = 'dsh-home'

/** Stable QingClaw profile name, intentionally distinct from the upstream Desktop profile. */
export const QINGCLAW_DESKTOP_PROFILE_NAME = 'qingclaw-desktop'

/** Minimal Electron path API required before the rest of the main process is imported. */
export interface QingClawDesktopPathApp {
  /** Whether Electron is running an installed application. */
  readonly isPackaged: boolean
  /** Resolve one Electron-managed application data path. */
  getPath(name: 'appData' | 'userData'): string
  /** Replace one Electron-managed application data path before readiness. */
  setPath(name: 'userData' | 'sessionData', path: string): void
}

/** QingClaw-exclusive roots selected before Desktop runtime initialization. */
export interface QingClawDesktopDataPaths {
  /** Electron preferences, browser state, caches, and other application-owned files. */
  readonly userData: string
  /** Harness state, credentials, profiles, projects, and plugin data. */
  readonly dshHome: string
}

function installedUpdateQualificationPaths(
  app: QingClawDesktopPathApp,
  environment: NodeJS.ProcessEnv,
): QingClawDesktopDataPaths | undefined {
  if (!app.isPackaged) return undefined
  const dshHome = environment.DSH_HOME
  const journals = environment.DSH_DESKTOP_UPDATE_JOURNAL_DIR
  if (dshHome === undefined || dshHome === '' || journals === undefined || journals === '') return undefined
  const userData = app.getPath('userData')
  const root = dirname(userData)
  if (basename(userData) !== 'user-data'
    || basename(dirname(root)) !== 'dsh-update-qualification'
    || dshHome !== join(root, 'dsh-home')
    || journals !== join(root, 'journals')) return undefined
  return { userData, dshHome }
}

/**
 * Select QingClaw-owned roots without inspecting either the ambient `DSH_HOME` or `~/.dsh`.
 *
 * Installed update qualification has already assigned a per-run isolated root in its outer
 * bootstrap, so that exact validated shape is retained. An unpackaged launch retains Electron's
 * explicit development `userData` root but always derives Harness state beneath it. Production
 * ignores ambient `DSH_HOME` and selects a stable QingClaw directory below OS application data.
 *
 * @param app - Electron path API available before `app.whenReady()`.
 * @param environment - Main-process environment whose `DSH_HOME` will be replaced.
 * @returns QingClaw-exclusive Electron and Harness roots.
 */
export function resolveQingClawDesktopDataPaths(
  app: QingClawDesktopPathApp,
  environment: NodeJS.ProcessEnv,
): QingClawDesktopDataPaths {
  const qualification = installedUpdateQualificationPaths(app, environment)
  if (qualification !== undefined) return qualification
  const userData = app.isPackaged
    ? join(app.getPath('appData'), QINGCLAW_USER_DATA_DIRECTORY)
    : app.getPath('userData')
  return { userData, dshHome: join(userData, QINGCLAW_DSH_HOME_DIRECTORY) }
}

/**
 * Install QingClaw's process-wide data isolation before any Desktop runtime module is evaluated.
 *
 * This function performs no filesystem operation. Electron and Harness create only the returned
 * branded roots later in startup; an existing official `~/.dsh` is neither examined nor migrated.
 *
 * @param app - Electron path API available before `app.whenReady()`.
 * @param environment - Main-process environment updated in place.
 * @returns the installed QingClaw-exclusive roots.
 */
export function configureQingClawDesktopDataIsolation(
  app: QingClawDesktopPathApp,
  environment: NodeJS.ProcessEnv,
): QingClawDesktopDataPaths {
  const paths = resolveQingClawDesktopDataPaths(app, environment)
  app.setPath('userData', paths.userData)
  app.setPath('sessionData', paths.userData)
  environment.DSH_HOME = paths.dshHome
  return paths
}
