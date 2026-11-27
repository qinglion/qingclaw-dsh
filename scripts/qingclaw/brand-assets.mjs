#!/usr/bin/env node
/**
 * Materialize this distribution's packaging inputs into the upstream checkout.
 *
 * The release pipeline checks out the fork, runs this script, then packages. The
 * upstream tree therefore keeps its own artwork and installer copy, while a
 * packaged build shows the QingClaw name and artwork. Run with --check to report
 * drift without writing.
 *
 * @module scripts/qingclaw/brand-assets
 */
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const brand = join(root, 'assets/branding/desktop')

/** Brand asset in the source folder and the upstream path it replaces. */
const ASSETS = [
  ['icon.svg', 'apps/desktop/resources/icon.svg'],
  ['icon-macos.svg', 'apps/desktop/resources/icon-macos.svg'],
  ['icon-windows.svg', 'apps/desktop/resources/icon-windows.svg'],
  ['icon.png', 'apps/desktop/resources/icon.png'],
  ['icon-macos.png', 'apps/desktop/resources/icon-macos.png'],
  ['icon-windows.png', 'apps/desktop/resources/icon-windows.png'],
  ['tray-windows.ico', 'apps/desktop/resources/tray-windows.ico'],
  ['welcome-brand.svg', 'apps/desktop/renderer/assets/welcome-brand.svg'],
]

/** Upstream product name in installer copy and this distribution's name per locale. */
const PRODUCT_NAME = 'DeepSeek Harness'
const LOCALES = {
  de_DE: 'QingClaw',
  en_US: 'QingClaw',
  es_ES: 'QingClaw',
  fr_FR: 'QingClaw',
  ja_JP: 'QingClaw',
  pt_BR: 'QingClaw',
  ru_RU: 'QingClaw',
  zh_CN: '青狮龙虾',
}

/** Chinese copy spaces the upstream name as a Latin token; the Chinese name needs none. */
const replaceName = (line, locale, name) => locale === 'zh_CN'
  ? line.replaceAll(/ ?DeepSeek Harness ?/gu, name)
  : line.replaceAll(PRODUCT_NAME, name)

/** Installer copy that names this application rather than a foreign installation. */
const NAMING_KEYS = ['INSTALLER_LAUNCH_FAILED', 'INSTALLER_RUNNING', 'INSTALLER_PATH_OWNERSHIP']

const check = process.argv.includes('--check')
const drift = []

for (const [source, target] of ASSETS) {
  const from = join(brand, source)
  const to = join(root, target)
  const wanted = await readFile(from)
  const current = await readFile(to).catch(() => undefined)
  if (current?.equals(wanted) === true) continue
  drift.push(target)
  if (!check) await copyFile(from, to)
}

const localeDirectory = join(root, 'apps/desktop/installer/locales')
for (const file of (await readdir(localeDirectory)).filter(name => name.endsWith('.json'))) {
  const locale = file.slice(0, -'.json'.length)
  const name = LOCALES[locale]
  if (name === undefined) throw new Error(`brand-assets: no product name for installer locale ${locale}`)
  const path = join(localeDirectory, file)
  const text = await readFile(path, 'utf8')
  // Only the copy that names the running application is renamed; the uninstall
  // hint keeps the upstream name because it describes a foreign installation.
  const renamed = text.split('\n')
    .map(line => NAMING_KEYS.some(key => line.includes(`"${key}"`)) ? replaceName(line, locale, name) : line)
    .join('\n')
  if (renamed === text) continue
  drift.push(`apps/desktop/installer/locales/${file}`)
  if (!check) await writeFile(path, renamed)
}

if (!check) {
  console.log(`brand-assets: applied ${drift.length} packaging input(s)`)
} else if (drift.length > 0) {
  console.error('brand-assets: the checkout does not carry this distribution yet:')
  for (const path of drift) console.error(`  ${path}`)
  process.exitCode = 1
} else {
  console.log('brand-assets: every packaging input already carries this distribution')
}