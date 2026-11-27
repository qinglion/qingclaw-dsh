#!/usr/bin/env node
/**
 * Keep this distribution's packaging inputs out of the repository.
 *
 * The application icons, the welcome mark and the installer copy stay upstream in
 * git; packaging applies the distribution through scripts/qingclaw/brand-assets.mjs.
 * A committed brand input would put those files back on the fork's patch list, so
 * this gate fails when the checkout modifies any of them.
 * @module scripts/verify-qingclaw-packaging-inputs
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Upstream paths the distribution supplies at packaging time. */
const MANAGED = [
  'apps/desktop/resources',
  'apps/desktop/renderer/assets/welcome-brand.svg',
  'apps/desktop/installer/locales',
]

const base = process.env.QINGCLAW_PACKAGING_BASE?.trim() || 'origin/master'
let changed
try {
  // Additions are the distribution's own files; only a modified or removed upstream
  // input would put a shared file back on the fork's patch list.
  changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=MD', base, '--', ...MANAGED], {
    encoding: 'utf8', cwd: root,
  })
} catch {
  // A checkout without the upstream remote cannot answer this; say so instead of passing.
  console.error(`verify-qingclaw-packaging-inputs: cannot compare against ${base}; fetch it or set QINGCLAW_PACKAGING_BASE`)
  process.exit(2)
}

const files = changed.split('\n').filter(Boolean)
if (files.length > 0) {
  console.error('verify-qingclaw-packaging-inputs: the repository must keep upstream packaging inputs:')
  for (const file of files) console.error(`  ${file}`)
  console.error('Let packaging apply them with scripts/qingclaw/brand-assets.mjs instead of committing them.')
  process.exit(1)
}
console.log('verify-qingclaw-packaging-inputs: every packaging input matches upstream')