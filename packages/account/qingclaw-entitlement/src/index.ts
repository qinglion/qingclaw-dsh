/**
 * QingClaw licence gate: while the signed-in account does not hold the
 * professional licence, it remembers the workbenches that were enabled, turns
 * them off, and turns that same set back on once the licence returns.
 *
 * The plugin owns no model-facing surface. Disabling a workbench bundle stops
 * its Loader rows, so its tools, prompts, remotes, and timers leave with the
 * fiber; restoring the bundle starts those rows again.
 * @module @qinglion/dsh-qingclaw-entitlement
 */
import { readFile, rm } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshPath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from './events.ts'

/** One profile bundle as the plugin manager reports it. */
interface BundleInfo {
  readonly name: string
  readonly installed: boolean
  readonly enabled: boolean
  readonly availability: 'installation' | 'profile' | 'missing'
}

/** The plugin-manager slice this gate drives. */
interface BundleManager {
  listBundles(): Promise<readonly BundleInfo[]>
  setBundleEnabled(name: string, enabled: boolean): Promise<{
    readonly application: string
    readonly error?: { readonly code?: string }
  }>
}

/** The professional licence the account holds right now. */
interface Licence {
  readonly active: boolean
  readonly plan: string | null
  readonly endsAt: string | null
  /** When the Host last observed this value; a cached row is usable offline. */
  readonly checkedAt: number
  /** False when no account grant is stored; absent on a cache written before this field existed. */
  readonly signedIn?: boolean
}

/** The workbench catalog this gate reads for the installed package names. */
interface WorkbenchReader {
  getWorkbenchCatalog(refresh: boolean): Promise<{
    readonly entries: readonly { readonly packageName: string; readonly title: string }[]
  }>
}

/** One account profile response, narrowed to the licence fields. */
interface AccountProfile {
  readonly plan?: string | null
  readonly subscriptionEndsAt?: string | null
  readonly subscriptionActive?: boolean | null
}

/** The account slice used when the product workbench service is absent. */
interface AccountReader {
  getPlatformSession(): Promise<unknown>
  getProfile(client: {
    version: string
    locale: string
    timezoneOffsetSeconds: number
  }): Promise<
    | { readonly status: 'ready'; readonly value: AccountProfile }
    | { readonly status: 'failed' }
    | null
  >
}

/** Workbenches enabled when the licence lapsed, restored when it returns. */
interface LockRecord {
  readonly version: 1
  readonly lockedAt: number
  readonly bundles: readonly string[]
}

/** Settings for the licence poll and its durable records. */
export interface Config {
  /** How often the licence is re-read; 0 disables the timer. */
  readonly pollMs: number
  /** Absolute file remembering the workbenches the lapse disabled. */
  readonly lockedFile?: string
  /** Absolute file caching the last observed licence for offline starts. */
  readonly licenceFile?: string
  /** Package-name prefix treated as a workbench when the catalog cannot answer. */
  readonly fallbackPrefix: string
}

/** Validated config; paths default under the Harness home. */
export const Config = z.object({
  pollMs: z.number().step(1).min(0).max(2_147_483_647).default(10 * 60 * 1000),
  lockedFile: z.string(),
  licenceFile: z.string(),
  fallbackPrefix: z.string().default('@qinglion/'),
})

const SELF = '@qinglion/dsh-qingclaw-entitlement'

/** Loader row name this plugin registers under. */
export const name = 'qingclaw-entitlement'

/**
 * Watch the signed-in licence and suspend or restore the workbenches it governs.
 * @param ctx - Host context supplying the plugin manager and account services.
 * @param config - licence poll cadence, durable files, and the fallback prefix.
 */
export function apply(ctx: Context, config: Config): void {
  const lockedFile = config.lockedFile ?? dshPath('state', 'qingclaw-entitlement', 'locked.json')
  const licenceFile = config.licenceFile ?? dshPath('state', 'qingclaw-entitlement', 'licence.json')
  const manager = (): BundleManager | undefined => ctx.get('pluginManager') as BundleManager | undefined
  let running: Promise<void> | undefined
  let closed = false
  let latest: Licence | undefined
  let latestCatalog: ReadonlyMap<string, string> | undefined
  let upgradeWatch: ReturnType<typeof setInterval> | undefined
  let selfOperation = false

  const warn = (message: string, error?: unknown): void => {
    if (error === undefined) ctx.logger.warn(message)
    else ctx.logger.warn(message, error)
  }

  const readJson = async <T>(file: string): Promise<T | undefined> => {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      warn(`qingclaw-entitlement: ignored unreadable ${file}`, error)
      return undefined
    }
  }

  const writeJson = async (file: string, value: unknown): Promise<void> => {
    await writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  }

  /** Read the live licence from the account profile; an unanswered read stays unknown. */
  const readLicence = async (): Promise<Licence | undefined> => {
    const account = ctx.get('deepseekAccount') as AccountReader | undefined
    if (account === undefined) return undefined
    try {
      if (await account.getPlatformSession() === null) {
        return { active: false, plan: null, endsAt: null, checkedAt: Date.now(), signedIn: false }
      }
      const result = await account.getProfile({
        version: process.env.DSH_CLIENT_VERSION ?? '0.0.0',
        locale: 'zh-CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (result === null || result.status !== 'ready') return undefined
      const plan = result.value.plan ?? null
      const endsAt = result.value.subscriptionEndsAt ?? null
      const active = plan === 'pro'
        && (endsAt === null || Date.parse(endsAt) > Date.now())
        && result.value.subscriptionActive === true
      return { active, plan, endsAt, checkedAt: Date.now(), signedIn: true }
    } catch (error) {
      warn('qingclaw-entitlement: the account service could not answer the licence read', error)
      return undefined
    }
  }

  /** Use the live value when present, otherwise the cached row while its date still runs. */
  const currentLicence = async (): Promise<Licence | undefined> => {
    const cached = await readJson<Licence>(licenceFile)
    const observed = await readLicence()
    if (observed !== undefined) {
      latest = observed
      try {
        await writeJson(licenceFile, observed)
      } catch (error) {
        warn('qingclaw-entitlement: could not cache the observed licence', error)
      }
      return observed
    }
    if (cached === undefined) return undefined
    const endsAt = cached.endsAt === null ? undefined : Date.parse(cached.endsAt)
    latest = { ...cached, active: cached.active && (endsAt === undefined || endsAt > Date.now()) }
    return latest
  }

  /** Catalog titles by package name, or undefined when the catalog cannot answer. */
  const catalogEntries = async (): Promise<ReadonlyMap<string, string> | undefined> => {
    const workbench = ctx.get('qingclawWorkbench') as WorkbenchReader | undefined
    if (workbench === undefined) return undefined
    try {
      const catalog = await workbench.getWorkbenchCatalog(false)
      latestCatalog = new Map(catalog.entries.map(entry => [entry.packageName, entry.title]))
      return latestCatalog
    } catch (error) {
      warn('qingclaw-entitlement: the workbench catalog is unavailable; using the package prefix', error)
      return undefined
    }
  }

  const isWorkbench = (bundle: BundleInfo, catalog: ReadonlyMap<string, string> | undefined): boolean =>
    bundle.installed && bundle.availability === 'profile' && bundle.name !== SELF
      && (catalog?.has(bundle.name) === true || bundle.name.startsWith(config.fallbackPrefix))

  /** Run one manager toggle without letting the gate react to its own operation. */
  const setEnabled = async (bundles: BundleManager, name: string, enabled: boolean): Promise<{
    readonly application: string
    readonly error?: { readonly code?: string }
  }> => {
    selfOperation = true
    try {
      return await bundles.setBundleEnabled(name, enabled)
    } finally {
      selfOperation = false
    }
  }

  /** Remember the finished set and disable every enabled workbench. */
  const lock = async (): Promise<void> => {
    const bundles = manager()
    if (bundles === undefined) return
    const catalog = await catalogEntries()
    const enabled = (await bundles.listBundles())
      .filter(bundle => isWorkbench(bundle, catalog) && bundle.enabled)
      .map(bundle => bundle.name)
    if (enabled.length === 0) return
    if (await readJson<LockRecord>(lockedFile) === undefined) {
      try {
        await writeJson(lockedFile, { version: 1, lockedAt: Date.now(), bundles: enabled })
      } catch (error) {
        warn('qingclaw-entitlement: could not record the enabled workbenches; leaving them running', error)
        return
      }
    }
    for (const name of enabled) {
      try {
        const result = await setEnabled(bundles, name, false)
        if (result.application !== 'applied' && result.application !== 'restart-required') {
          warn(`qingclaw-entitlement: could not disable ${name} (${result.error?.code ?? result.application})`)
        }
      } catch (error) {
        warn(`qingclaw-entitlement: could not disable ${name}`, error)
      }
    }
  }

  /** Re-enable the recorded workbenches, dropping names that no longer exist. */
  const restore = async (): Promise<void> => {
    const bundles = manager()
    if (bundles === undefined) return
    const record = await readJson<LockRecord>(lockedFile)
    if (record === undefined) return
    const installed = new Map((await bundles.listBundles()).map(bundle => [bundle.name, bundle]))
    const pending: string[] = []
    for (const name of record.bundles) {
      const bundle = installed.get(name)
      if (bundle === undefined || !bundle.installed || bundle.enabled) continue
      try {
        const result = await setEnabled(bundles, name, true)
        const code = result.error?.code
        const applied = result.application === 'applied' || result.application === 'restart-required'
        if (!applied && code !== 'not-bundle' && code !== 'unknown-bundle') pending.push(name)
      } catch (error) {
        warn(`qingclaw-entitlement: could not restore ${name}`, error)
        pending.push(name)
      }
    }
    if (pending.length === 0) {
      await rm(lockedFile, { force: true })
      return
    }
    try {
      await writeJson(lockedFile, { ...record, bundles: pending })
    } catch (error) {
      warn('qingclaw-entitlement: could not keep the remaining restores', error)
    }
  }

  const stopUpgradeWatch = (): void => {
    if (upgradeWatch === undefined) return
    clearInterval(upgradeWatch)
    upgradeWatch = undefined
  }

  /** Re-read the licence every few seconds after a prompt, so a completed payment restores the workbenches promptly. */
  const watchForUpgrade = (): void => {
    if (upgradeWatch !== undefined) return
    let remaining = 60
    upgradeWatch = setInterval(() => {
      remaining -= 1
      if (closed || remaining <= 0) { stopUpgradeWatch(); return }
      void reconcile()
    }, 5_000)
    upgradeWatch.unref()
  }

  /** Apply the period rule to a value that may predate its own end date. */
  const effective = (licence: Licence): Licence => {
    if (licence.endsAt === null) return licence
    return { ...licence, active: licence.active && Date.parse(licence.endsAt) > Date.now() }
  }

  /** Ask the browser for the upgrade prompt when a signed-in free user enables a workbench. */
  const noticeEnable = async (target: string): Promise<void> => {
    const observed = latest ?? await currentLicence()
    if (observed === undefined) return
    const licence = effective(observed)
    if (licence.active || licence.signedIn !== true) return
    const catalog = latestCatalog ?? await catalogEntries()
    const title = catalog?.get(target)
    if (title === undefined && !target.startsWith(config.fallbackPrefix)) return
    ctx.emit('qingclaw-entitlement/upgrade-required', { packageName: target, title: title ?? target })
    watchForUpgrade()
  }

  const run = async (): Promise<void> => {
    const licence = await currentLicence()
    if (licence === undefined || closed) return
    if (licence.active) {
      await restore()
      stopUpgradeWatch()
    } else await lock()
  }

  const reconcile = (): Promise<void> => {
    if (closed) return Promise.resolve()
    running ??= run()
      .catch((error: unknown) => { warn('qingclaw-entitlement: a licence reconciliation failed', error) })
      .finally(() => { running = undefined })
    return running
  }

  ctx.on('plugin-manager/operation', (operation) => {
    if (selfOperation) return
    if (operation.phase !== 'started' || operation.stage !== 'enable' || operation.enabled !== true) return
    if (operation.target === null) return
    const target = operation.target
    void (async () => {
      const licence = await currentLicence()
      if (licence?.active === true) {
        await restore()
        stopUpgradeWatch()
        return
      }
      await noticeEnable(target)
    })()
  })
  ctx.on('plugin-manager/changed', () => { void reconcile() })
  ctx.on('deepseek-account/signed-out', () => { void reconcile() })
  ctx.on('deepseek-account/session-expired', () => { void reconcile() })

  if (config.pollMs > 0) {
    ctx.effect(() => {
      const timer = setInterval(() => { void reconcile() }, config.pollMs)
      timer.unref()
      return () => { clearInterval(timer) }
    }, 'qingclaw-entitlement: licence poll')
  }

  // Account and workbench services may mount after this row; retry early reads before the first poll.
  const retries = [2_000, 15_000].map(delay => setTimeout(() => { void reconcile() }, delay))
  for (const timer of retries) timer.unref()
  ctx.effect(() => () => { for (const timer of retries) clearTimeout(timer) }, 'qingclaw-entitlement: startup retries')

  ctx.effect(() => () => { closed = true; stopUpgradeWatch() }, 'qingclaw-entitlement: lifetime')
  void reconcile()
}
