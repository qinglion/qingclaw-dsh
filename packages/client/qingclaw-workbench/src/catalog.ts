import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { readBoundedBody } from './feed.ts'
import type { WorkbenchCatalogEntry, WorkbenchCatalogResult } from './types.ts'

/** The private registry the QingClaw catalog publishes to unless a deployment names another one. */
export const OFFICIAL_REGISTRY = 'https://npm.qingclaw.com/'
const PACKAGE = /^@qinglion\/[a-z0-9][a-z0-9._-]*$/
const numericIdentifier = /(?:0|[1-9]\d*)/.source
const prereleaseIdentifier = /(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)/.source
const VERSION = new RegExp(
  `^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}`
  + `(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?`
  + /(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.source,
)
const PANEL = /^[a-z][a-z0-9._-]{0,127}$/

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function url(value: unknown, source: URL, sameOrigin: boolean): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return
  try {
    const address = new URL(value, source)
    if (address.protocol === 'https:' && !address.username && !address.password
      && (!sameOrigin || address.origin === source.origin)) return address.href
  } catch { /* Invalid optional links are omitted. */ }
}

/**
 * Read the official directory of workbenches verified against this desktop runtime.
 * @param value - the decoded catalog document.
 * @param source - the URL the catalog was fetched from, for same-origin link checks.
 * @param registry - the private registry every entry must name; defaults to the official one.
 * @returns the validated entries, each carrying the registry.
 */
export function parseWorkbenchCatalog(value: unknown, source: URL, registry = OFFICIAL_REGISTRY): WorkbenchCatalogEntry[] {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.workbenches)
    || value.workbenches.length > 500) throw new Error('Invalid QingClaw workbench catalog')
  const names = new Set<string>()
  const panels = new Set<string>()
  const expectedRegistry = registry.endsWith('/') ? registry : registry + '/'
  return value.workbenches.map((row: unknown) => {
    if (!record(row)) throw new Error('Invalid workbench entry')
    const { packageName, panelId, version, title, description, author, category } = row
    const entryRegistry = row.registry
    if (typeof packageName !== 'string' || !PACKAGE.test(packageName) || packageName.length > 214
      || typeof panelId !== 'string' || !PANEL.test(panelId) || ['plugins', 'qingclaw-workbench'].includes(panelId)
      || typeof version !== 'string' || !VERSION.test(version) || version.length > 255
      || (entryRegistry !== expectedRegistry && entryRegistry !== expectedRegistry.slice(0, -1))
      || typeof title !== 'string' || !title.trim() || typeof description !== 'string'
      || typeof author !== 'string' || typeof category !== 'string'
      || names.has(packageName) || panels.has(panelId)) throw new Error('Invalid QingClaw workbench entry')
    names.add(packageName)
    panels.add(panelId)
    const previewUrl = url(row.previewUrl, source, true)
    const iconUrl = url(row.iconUrl, source, true)
    const previews = Array.isArray(row.previews)
      ? row.previews.slice(0, 8).map(item => url(item, source, true)).filter((item): item is string => item !== undefined)
      : []
    const repositoryUrl = url(row.repositoryUrl, source, false)
    return { packageName, panelId, version, title, description, author, category, registry: expectedRegistry,
      ...(previewUrl ? { previewUrl } : {}), ...(iconUrl ? { iconUrl } : {}),
      ...(previews.length ? { previews } : {}), ...(repositoryUrl ? { repositoryUrl } : {}) }
  })
}

export async function fetchWorkbenchCatalog(
  source: URL, timeout: number, limit: number, lifetime: AbortSignal, registry = OFFICIAL_REGISTRY,
): Promise<WorkbenchCatalogEntry[]> {
  const response = await fetch(source, { headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error',
    signal: AbortSignal.any([lifetime, AbortSignal.timeout(timeout)]) })
  if (!response.ok) throw new Error(`Workbench catalog HTTP ${response.status}`)
  const bytes = await readBoundedBody(response, limit)
  return parseWorkbenchCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), source, registry)
}

interface CatalogOptions {
  /** The private registry every entry must name; absent means the official one. */
  readonly registry?: string
  readonly cacheFile?: string
  readonly cacheTtlMs: number
  readonly maxResponseBytes: number
  readonly fetchTimeoutMs: number
}

/** Source-bound last-good directory for reopening installed panels after an offline restart. */
export class WorkbenchDirectory {
  private readonly filename: string | undefined
  private lastGood: { entries: WorkbenchCatalogEntry[]; fetchedAt: number } | undefined
  private restoration: Promise<void> | undefined
  private request: Promise<WorkbenchCatalogResult> | undefined
  private readonly registry: string

  constructor(private readonly source: URL, private readonly options: CatalogOptions, private readonly lifetime: AbortSignal) {
    this.filename = options.cacheFile ? join(dirname(options.cacheFile), 'workbench-catalog-v1.json') : undefined
    this.registry = options.registry ?? OFFICIAL_REGISTRY
  }

  async get(refresh: boolean): Promise<WorkbenchCatalogResult> {
    await (this.restoration ??= this.restore())
    this.lifetime.throwIfAborted()
    if (!refresh && this.lastGood && Date.now() - this.lastGood.fetchedAt < this.options.cacheTtlMs) {
      return { entries: this.lastGood.entries, stale: false }
    }
    if (!this.request) this.request = this.refresh().finally(() => { this.request = undefined })
    return this.request
  }

  private async restore(): Promise<void> {
    if (!this.filename) return
    try {
      if ((await stat(this.filename)).size > this.options.maxResponseBytes * 3 + 4096) return
      const value: unknown = JSON.parse(await readFile(this.filename, 'utf8'))
      if (!record(value) || value.source !== this.source.href) return
      if (typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt) || value.fetchedAt > Date.now()) return
      this.lastGood = { entries: parseWorkbenchCatalog(value, this.source, this.registry), fetchedAt: value.fetchedAt }
    } catch { /* A corrupt cache is never authoritative. */ }
  }

  private async refresh(): Promise<WorkbenchCatalogResult> {
    let entries: WorkbenchCatalogEntry[]
    try {
      entries = await fetchWorkbenchCatalog(this.source, this.options.fetchTimeoutMs, this.options.maxResponseBytes,
        this.lifetime, this.registry)
    } catch (cause) {
      this.lifetime.throwIfAborted()
      if (this.lastGood) return { entries: this.lastGood.entries, stale: true }
      throw cause
    }
    this.lifetime.throwIfAborted()
    const fetchedAt = Date.now()
    this.lastGood = { entries, fetchedAt }
    if (this.filename) {
      const data = JSON.stringify({ source: this.source.href, fetchedAt, schemaVersion: 1, workbenches: entries })
      try { await writeFileAtomic(this.filename, data, { mode: 0o600, dirMode: 0o700 }) }
      catch { /* Keep fresh online entries when the optional disk cache is unwritable. */ }
    }
    return { entries, stale: false }
  }
}
