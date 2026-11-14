/** QingClaw Electron entry: establish branded data roots before importing any Desktop runtime. */

import { app } from 'electron'
import { configureQingClawDesktopDataIsolation } from './qingclaw-data-isolation.ts'

configureQingClawDesktopDataIsolation(app, process.env)

void import('./main.ts').catch((error: unknown) => {
  console.error('QingClaw Desktop runtime import failed', error)
  app.exit(1)
})
