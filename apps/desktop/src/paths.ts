/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { QINGCLAW_DESKTOP_PROFILE_NAME } from './qingclaw-data-isolation.ts'

/** Stable QingClaw Desktop installation paths under its isolated Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every QingClaw profile path below the already-isolated Harness home.
 * @param dshHome - QingClaw-exclusive Harness home established by the Electron entry.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  const profile = join(dshHome, 'profiles', QINGCLAW_DESKTOP_PROFILE_NAME)
  return {
    profile,
    lock: join(profile, 'lock'),
  }
}
