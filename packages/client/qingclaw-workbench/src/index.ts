/** Host owner of the QingClaw public learning feed and its last-good cache. */

import { isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  fetchOfficialFeed, parseCacheRecord, serializeCacheRecord, type WorkbenchCacheRecord,
} from './feed.ts'
import type {
  ProEntitlement, WorkbenchCatalogEntry, WorkbenchCatalogResult, WorkbenchFeedResult, WorkbenchInstallResult,
} from './types.ts'
import { readRegistryReadme } from './readme.ts'
import { OFFICIAL_REGISTRY, WorkbenchDirectory } from './catalog.ts'
import { WorkbenchRegistryAccess, type RegistryAuthorization } from './registry-auth.ts'

export type * from './types.ts'

const DEFAULT_FEED_URL = 'https://qingclaw.com/api/workbench-feed'

/** Minimal native installer the workbench host installs a listed package through. */
interface BundleInstaller {
  installBundle(spec: string, options: {
    enabled: boolean
    saveExact: boolean
    registry: string
    expected: { readonly name: string; readonly version: string }
    authToken: string
  }): Promise<{
    application: WorkbenchInstallResult['application']
    error?: { code?: string; diagnostic?: string }
  }>
}

/** Minimal account reader used for the professional entitlement gate. */
interface AccountProfileReader {
  getProfile(client: { version: string; locale: string; timezoneOffsetSeconds: number }): Promise<
    | { status: 'ready'; value: { plan?: string | null; subscriptionEndsAt?: string | null } }
    | { status: 'failed' }
    | null
  >
}

/** Host settings for the public feed boundary and optional durable cache. */
export interface Config {
  readonly feedUrl: string
  /** Private registry every catalog entry must name; deployment-specific, defaults to the official one. */
  readonly registry: string
  /** Absolute owner-private cache file; omission keeps only the process-local last good value. */
  readonly cacheFile?: string
  readonly cacheTtlMs: number
  readonly fetchTimeoutMs: number
  readonly maxResponseBytes: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** QingClaw public learning feed service. */
    qingclawWorkbench: QingClawWorkbench
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Public content is unavailable and no last-good cache can be shown. */
    'qingclaw-workbench/feed-unavailable': { readonly reason: 'network' | 'shutdown' }
    /** The private registry needs a signed-in QingClaw account for this read or installation. */
    'qingclaw-workbench/sign-in-required': Record<string, never>
  }
}

/** Host-cached public learning feed exposed through the generated `qingclawWorkbench` Remote. */
export default class QingClawWorkbench extends TypertRemoteService {
  static Config = z.object({
    feedUrl: z.string().default(DEFAULT_FEED_URL),
    registry: z.string().default(OFFICIAL_REGISTRY),
    cacheFile: z.string(),
    cacheTtlMs: z.number().step(1).min(0).max(2_147_483_647).default(5 * 60 * 1000),
    fetchTimeoutMs: z.number().step(1).min(1).max(2_147_483_647).default(8_000),
    maxResponseBytes: z.number().step(1).min(1).max(16 * 1024 * 1024).default(1024 * 1024),
  })

  private readonly feedUrl: URL
  private readonly lifetime = new AbortController()
  private closing = false
  private cacheRead: Promise<void> | undefined
  private lastGood: WorkbenchCacheRecord | undefined
  private pending: Promise<WorkbenchFeedResult> | undefined
  private readonly directory: WorkbenchDirectory
  private readonly registry: WorkbenchRegistryAccess

  /** Fetch the public directory of desktop-compatible workbenches. */
  @Remote
  async getWorkbenchCatalog(refresh: boolean): Promise<WorkbenchCatalogResult> {
    this.assertOpen()
    return this.directory.get(refresh)
  }

  /** Read the document of a version currently listed by the product directory. */
  @Remote
  async getWorkbenchReadme(name: string, version: string, language: string): Promise<string | null> {
    this.assertOpen()
    const entry = await this.listedEntry(name, version)
    const { token } = await this.registry.authorization(entry.registry)
    return readRegistryReadme(entry, language, this.lifetime.signal, token)
  }

  /**
   * Install one listed version from the private registry for the signed-in account.
   * The registry token is obtained here so that it never leaves the Host process.
   * @param name - the catalog package name.
   * @param version - the exact listed version.
   * @returns the installation outcome the product UI reports.
   */
  @Remote
  async installWorkbench(name: string, version: string): Promise<WorkbenchInstallResult> {
    this.assertOpen()
    const entry = await this.listedEntry(name, version)
    const manager = this.ctx.get('pluginManager') as BundleInstaller | undefined
    if (manager === undefined) throw new Error('当前运行环境不支持安装工作台。')
    const { token } = await this.registry.authorization(entry.registry)
    const leaf = entry.packageName.split('/')[1]
    const archive = new URL(`${entry.packageName}/-/${leaf}-${entry.version}.tgz`, entry.registry).href
    // The registry is pinned so a Host fallback registry never becomes the package transport.
    const result = await manager.installBundle(archive, { enabled: true, saveExact: true,
      registry: entry.registry, expected: { name, version }, authToken: token })
    const diagnostic = result.error?.diagnostic ?? result.error?.code
    return { application: result.application, ...diagnostic === undefined ? {} : { diagnostic } }
  }

  /**
   * The registry token that authorizes private reads for the signed-in account.
   * Host-only support for the product's other plugins; it has no Remote surface,
   * so the token never reaches the browser.
   * @param registry - the registry URL the caller reads.
   * @returns the bearer token and its expiry.
   */
  registryAuthorization(registry: string): Promise<RegistryAuthorization> {
    return this.registry.authorization(registry)
  }

  /** The catalog entry that names one exact listed version. */
  private async listedEntry(name: string, version: string): Promise<WorkbenchCatalogEntry> {
    const { entries } = await this.directory.get(false)
    const entry = entries.find(item => item.packageName === name && item.version === version)
    if (!entry) throw new Error('Unknown workbench version')
    return entry
  }

  /** @param ctx - Host context supplying logging and effect ownership. @param config - validated plugin settings. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'qingclawWorkbench')
    this.feedUrl = publicHttpUrl(config.feedUrl)
    const origin = publicHttpUrl(process.env.QINGCLAW_PLATFORM_ORIGIN || 'https://qingclaw.com')
    this.directory = new WorkbenchDirectory(new URL('/workbenches/index.json', origin),
      { ...config, registry: registryUrl(config.registry) }, this.lifetime.signal)
    this.registry = new WorkbenchRegistryAccess(ctx, this.lifetime.signal)
    if (config.cacheFile !== undefined && !isAbsolute(config.cacheFile)) {
      throw new Error('qingclaw-workbench: cacheFile must be absolute')
    }
    ctx.effect(() => async () => {
      this.closing = true
      this.lifetime.abort()
      await this.pending?.catch(() => undefined)
    }, 'qingclaw-workbench: stop feed refresh')
  }

  /**
   * Read the current public Feed v1 view, refreshing stale content or on explicit request.
   * A failed refresh returns the last good value as stale; without one it fails for the UI to retry.
   * @param refresh - bypass a fresh cache when true.
   * @returns validated content and its freshness source.
   */
  @Remote
  async getFeed(refresh: boolean): Promise<WorkbenchFeedResult> {
    this.assertOpen()
    await (this.cacheRead ??= this.readCache())
    this.assertOpen()
    const cached = this.lastGood
    if (!refresh && cached !== undefined && Date.now() - cached.fetchedAt <= this.config.cacheTtlMs) {
      return { feed: cached.feed, source: 'cache', stale: false }
    }
    if (this.pending !== undefined) return this.pending
    const pending = this.refreshFeed()
    this.pending = pending
    try {
      return await pending
    } finally {
      if (this.pending === pending) this.pending = undefined
    }
  }

  /** Read the signed-in account's QingClaw professional entitlement. */
  @Remote
  async getEntitlement(): Promise<ProEntitlement> {
    try {
      const account = this.ctx.get('deepseekAccount') as AccountProfileReader | undefined
      if (account === undefined) return { active: false, plan: null, endsAt: null }
      const result = await account.getProfile({
        version: process.env.DSH_CLIENT_VERSION ?? '0.0.0',
        locale: 'zh-CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (result === null || result.status !== 'ready') return { active: false, plan: null, endsAt: null }
      const plan = result.value.plan ?? null
      const endsAt = result.value.subscriptionEndsAt ?? null
      const active = plan === 'pro' && (endsAt === null || Date.parse(endsAt) > Date.now())
      return { active, plan, endsAt }
    } catch {
      return { active: false, plan: null, endsAt: null }
    }
  }

  private async refreshFeed(): Promise<WorkbenchFeedResult> {
    try {
      const feed = await fetchOfficialFeed({
        url: this.feedUrl,
        timeoutMs: this.config.fetchTimeoutMs,
        maxResponseBytes: this.config.maxResponseBytes,
        signal: this.lifetime.signal,
      })
      this.assertOpen()
      const record: WorkbenchCacheRecord = { version: 1, fetchedAt: Date.now(), feed }
      this.lastGood = record
      await this.writeCache(record)
      this.assertOpen()
      return { feed, source: 'network', stale: false }
    } catch (cause) {
      if (this.closing) throw unavailable('shutdown', cause)
      const fallback = this.lastGood
      if (fallback !== undefined) {
        this.ctx.logger.warn('QingClaw Workbench feed refresh failed; using last-good cache', cause)
        return { feed: fallback.feed, source: 'last-good', stale: true }
      }
      this.ctx.logger.warn('QingClaw Workbench feed is unavailable', cause)
      throw unavailable('network', cause)
    }
  }

  private assertOpen(): void {
    if (this.closing) throw unavailable('shutdown')
  }

  private async readCache(): Promise<void> {
    const filename = this.config.cacheFile
    if (filename === undefined) return
    try {
      this.lastGood = parseCacheRecord(JSON.parse(await readFile(filename, 'utf8')))
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException | null)?.code === 'ENOENT') return
      this.ctx.logger.warn('QingClaw Workbench ignored an invalid feed cache', cause)
    }
  }

  private async writeCache(record: WorkbenchCacheRecord): Promise<void> {
    const filename = this.config.cacheFile
    if (filename === undefined) return
    try {
      await writeFileAtomic(filename, serializeCacheRecord(record), { mode: 0o600, dirMode: 0o700 })
    } catch (cause) {
      // A public network result remains useful when the local optimization cannot be updated.
      this.ctx.logger.warn('QingClaw Workbench could not update its feed cache', cause)
    }
  }
}

function publicHttpUrl(value: string, name = 'feedUrl'): URL {
  const url = new URL(value)
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hostname === '') {
    throw new Error(`qingclaw-workbench: ${name} must be an HTTP(S) URL`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(`qingclaw-workbench: ${name} must not contain credentials`)
  }
  return url
}

/** Read one deployment's private registry URL, which catalog entries and reads must share. */
function registryUrl(value: string): string {
  const address = publicHttpUrl(value, 'registry')
  if (address.search !== '' || address.hash !== '') {
    throw new Error('qingclaw-workbench: registry must not carry a query or a fragment')
  }
  return address.pathname.endsWith('/') ? address.href : address.href + '/'
}

function unavailable(reason: 'network' | 'shutdown', cause?: unknown): RemoteError {
  return new RemoteError(
    'qingclaw-workbench/feed-unavailable',
    'QingClaw Workbench content is temporarily unavailable.',
    { reason },
    cause === undefined ? undefined : { cause },
  )
}
