/** QingClaw Electron entry: establish branded data roots before importing any Desktop runtime. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { qingclawDesktopDeployment } from './deployment.ts'
import { configureQingClawDesktopDataIsolation } from './qingclaw-data-isolation.ts'

/**
 * Read the packaging lane from the sealed application manifest. A missing or
 * unreadable manifest falls back to production rather than writing test data
 * into the production root.
 * @returns the deployment whose userData and DSH home this process owns.
 */
function packagedDeployment(): 'test' | 'production' {
  if (!app.isPackaged || typeof app.getAppPath !== 'function') return 'production'
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'))
    return qingclawDesktopDeployment(manifest).name
  } catch {
    return 'production'
  }
}

configureQingClawDesktopDataIsolation(app, process.env, packagedDeployment())

void import('./main.ts').catch((error: unknown) => {
  console.error('QingClaw Desktop runtime import failed', error)
  app.exit(1)
})
