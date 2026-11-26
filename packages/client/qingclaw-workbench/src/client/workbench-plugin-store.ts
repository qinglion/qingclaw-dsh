import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId } from '@deepseek-ai/dsh-plugin-manager/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import type { WorkbenchActiveInstall, WorkbenchCatalogEntry, WorkbenchInstallResult, WorkbenchPendingOperation } from '../types.ts'
import { workbenchPanelIcon } from './WorkbenchPanelIcon.tsx'

export interface WorkbenchPluginItem extends WorkbenchCatalogEntry {
  readonly id: string
  readonly iconUrl?: string
  readonly installed: boolean
  /** Version the profile currently has installed, when the Host reports one. */
  readonly installedVersion?: string
  /** A newer catalog version replaces the installed one. */
  readonly updateAvailable: boolean
  /** Selected in the profile; a disabled workbench stays installed but cannot open. */
  readonly enabled: boolean
  readonly installable: boolean
  readonly openable: boolean
  readonly favorite: boolean
  readonly restartRequired?: boolean
  /** The operation this row is running; it survives page switches and reloads while the Host runs it. */
  readonly pending?: WorkbenchPendingOperation
}

export interface WorkbenchReadmeDocument {
  readonly markdown: string
  readonly resolveImage?: (destination: string) => string | undefined
}

export interface WorkbenchPluginStore {
  readReadme(id: string, version: string, language: string): Promise<WorkbenchReadmeDocument | null>
  load(refresh?: boolean): Promise<readonly WorkbenchPluginItem[]>
  /** The current projection without a Host read, for subscribers reacting to progress. */
  snapshot(): readonly WorkbenchPluginItem[]
  install(id: string): Promise<void>
  update(id: string): Promise<void>
  uninstall(id: string): Promise<void>
  setEnabled(id: string, enabled: boolean): Promise<void>
  open(id: string): void
  setFavorite(id: string, favorite: boolean): void
  subscribe(listener: () => void): () => void
  dispose(): void
}

const FAVORITES = 'qingclaw.workbench.favorites.v1'

/**
 * Compare two SemVer versions: build metadata is ignored and a prerelease sorts before its release.
 * @param left - the installed version.
 * @param right - the catalog version.
 * @returns a negative number when left precedes right.
 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): { core: number[]; pre: string[] } => {
    const [withoutBuild = ''] = value.split('+')
    const [core = '', pre = ''] = withoutBuild.split('-')
    return { core: core.split('.').map(part => (/^\d+$/.test(part) ? Number(part) : 0)), pre: pre === '' ? [] : pre.split('.') }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    const order = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (order !== 0) return order
  }
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const one = a.pre[index]
    const two = b.pre[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    const oneNumeric = /^\d+$/.test(one)
    const twoNumeric = /^\d+$/.test(two)
    if (oneNumeric && twoNumeric) {
      const order = Number(one) - Number(two)
      if (order !== 0) return order
      continue
    }
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1
    if (one !== two) return one < two ? -1 : 1
  }
  return 0
}

/** The failure code the Host reports when the private registry needs a signed-in account. */
const SIGN_IN_REQUIRED = 'qingclaw-workbench/sign-in-required'

/** The failure code the Host reports when an installation needs the professional licence. */
const PRO_REQUIRED = 'qingclaw-workbench/pro-required'

/** Keep the Host's failure code on the error so the UI can ask for a sign-in instead of a retry. */
function remoteFailure(error: { readonly code: string; readonly message: string }): Error {
  return Object.assign(new Error(error.message), { code: error.code })
}

/** Whether a failed workbench operation needs a signed-in QingClaw account. */
export function needsSignIn(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === SIGN_IN_REQUIRED
}

/** Whether a refused installation needs the professional licence. */
export function needsPro(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === PRO_REQUIRED
}

function readIds(storage: Storage, key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch { return new Set() }
}

function updateId(storage: Storage, key: string, id: string, included: boolean): void {
  const values = readIds(storage, key)
  if (included) values.add(id)
  else values.delete(id)
  storage.setItem(key, JSON.stringify([...values]))
}

/** Read the last pnpm Progress line of a log chunk into fetch and link percentages. */
function parseProgress(text: string): { readonly download: number; readonly install: number; readonly added: number } | undefined {
  const last = [...text.matchAll(/Progress: resolved (\d+), reused (\d+), downloaded (\d+), added (\d+)/g)].at(-1)
  if (last === undefined) return undefined
  const total = Number(last[1])
  if (total <= 0) return undefined
  const added = Number(last[4])
  const percent = (value: number): number => Math.min(100, Math.round((value / total) * 100))
  return { download: percent(Number(last[2]) + Number(last[3])), install: percent(added), added }
}

/** One running operation, its progress, and the promise that settles it. */
interface PendingOperation extends WorkbenchPendingOperation {
  readonly id: string
  readonly requestId?: PluginInstallRequestId
  readonly promise: Promise<void>
}

/** Project the official directory, actual Host inventory and registered main panels. */
export function createWorkbenchPluginStore(ctx: Context, storage: Storage = window.localStorage): WorkbenchPluginStore {
  const listeners = new Set<() => void>()
  const sidebars = new Map<string, () => void>()
  const pending = new Map<string, PendingOperation>()
  const restartRequired = new Set<string>()
  /** Removals the Host applied to the profile that the installed inventory may still list until a restart. */
  const removed = new Set<string>()
  let entries: readonly WorkbenchCatalogEntry[] = []
  let offline = false
  let installed = new Map<string, string | undefined>()
  /** Bundles the profile owns, which a new catalog version can replace; shipped copies cannot be updated. */
  let managed = new Set<string>()
  /** Installed bundles the profile has selected; a disabled one stays installed but inert. */
  let enabledBundles = new Set<string>()
  let reading: Promise<void> | undefined
  let disposed = false
  const notify = (): void => { if (!disposed) for (const listener of listeners) listener() }
  const hasMain = (id: string): boolean => ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === id)
  const hasSidebar = (id: string): boolean => ctx.slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === id)

  function syncSidebars(): void {
    const shown = entries.filter(entry => present(entry.packageName) && hasMain(entry.panelId))
    const keep = new Set(shown.map(entry => entry.panelId))
    for (const [id, remove] of sidebars) {
      if (!keep.has(id)) { sidebars.delete(id); remove() }
    }
    for (const entry of shown) {
      // Existing plugins retain ownership of any launcher they registered.
      if (!ctx.slots.spec('sidebar.panellist') || hasSidebar(entry.panelId)) continue
      sidebars.set(entry.panelId, ctx.slots.register({ name: 'sidebar.panellist', id: entry.panelId as MainPanelId,
        label: entry.title }, workbenchPanelIcon(entry.iconUrl)))
    }
  }

  /** Whether the profile has this workbench, ignoring a removal the inventory has not caught up with. */
  function present(id: string): boolean {
    return installed.has(id) && !removed.has(id)
  }

  function find(id: string): WorkbenchCatalogEntry {
    const entry = entries.find(item => item.packageName === id)
    if (!entry) throw new Error('工作台目录中找不到该应用')
    return entry
  }

  function track(id: string, view: WorkbenchPendingOperation, requestId: PluginInstallRequestId | undefined, promise: Promise<void>): void {
    pending.set(id, { ...view, id, ...requestId === undefined ? {} : { requestId }, promise })
    notify()
  }

  function patch(id: string, changes: Partial<WorkbenchPendingOperation>): void {
    const current = pending.get(id)
    /* v8 ignore next -- callers resolve the operation first; settlement can only forget it between the two reads. */
    if (current === undefined) return
    pending.set(id, { ...current, ...changes })
    notify()
  }

  function forget(id: string): void {
    pending.delete(id)
    notify()
  }

  /** Apply one settled installation outcome and refresh the inventory before notifying. */
  async function settle(id: string, result: WorkbenchInstallResult): Promise<void> {
    if (result.application === 'failed' || result.application === 'cancelled' || result.application === 'overridden') {
      throw new Error(result.diagnostic ?? result.application)
    }
    if (result.application === 'restart-required') restartRequired.add(id)
    await load(true)
    notify()
  }

  async function read(refresh: boolean): Promise<void> {
    const [catalog, bundles] = await Promise.all([
      ctx.remote.qingclawWorkbench.getWorkbenchCatalog(refresh), ctx.remote.pluginManager.listBundles(),
    ])
    if (disposed) return
    if (!catalog.ok) throw new Error(catalog.error.message)
    if (!bundles.ok) throw new Error(bundles.error.message)
    entries = catalog.value.entries
    offline = catalog.value.stale
    installed = new Map(bundles.value.filter(bundle => bundle.availability !== 'missing'
      && (bundle.installed || bundle.availability === 'installation')).map(bundle => [bundle.name, bundle.version]))
    managed = new Set(bundles.value.filter(bundle => bundle.installed).map(bundle => bundle.name))
    enabledBundles = new Set(bundles.value.filter(bundle => bundle.enabled).map(bundle => bundle.name))
    for (const name of removed) {
      if (!installed.has(name)) removed.delete(name)
    }
    syncSidebars()
    // A client that mounted while an installation runs adopts it instead of offering a second install.
    const active = await ctx.remote.qingclawWorkbench.getActiveInstalls()
    if (disposed) return
    if (active.ok) {
      for (const record of active.value) {
        if (!pending.has(record.name)) adopt(record)
      }
    }
  }

  /** Await an installation this client did not start, reporting its outcome through the shared settlement. */
  function adopt(record: WorkbenchActiveInstall): void {
    const promise = (async () => {
      const answer = await ctx.remote.pluginManager.waitForInstall(record.requestId)
      if (!answer.ok) throw remoteFailure(answer.error)
      const result = answer.value
      if (result === null) {
        await load(true)
        notify()
        return
      }
      const diagnostic = result.error?.diagnostic ?? result.error?.code
      await settle(record.name, { application: result.application, ...diagnostic === undefined ? {} : { diagnostic } })
    })()
    track(record.name, { kind: record.kind, phase: 'starting', download: 0, install: 0 }, record.requestId, promise)
    // The client that started the installation reports its failure; a recovering client re-reads the inventory.
    void promise.catch(() => undefined).finally(() => { forget(record.name) })
  }

  function project(): readonly WorkbenchPluginItem[] {
    const favorites = readIds(storage, FAVORITES)
    return entries.map((entry) => {
      const has = present(entry.packageName)
      const installedVersion = has ? installed.get(entry.packageName) : undefined
      const openable = has && hasMain(entry.panelId)
      const operation = pending.get(entry.packageName)
      return { ...entry, id: entry.packageName, installed: has, installable: !has && !offline, openable,
        enabled: !has || enabledBundles.has(entry.packageName),
        favorite: favorites.has(entry.packageName),
        updateAvailable: has && managed.has(entry.packageName) && installedVersion !== undefined
          && compareVersions(installedVersion, entry.version) < 0,
        ...(installedVersion === undefined ? {} : { installedVersion }),
        restartRequired: has && !openable && restartRequired.has(entry.packageName),
        ...operation === undefined ? {} : { pending: {
          kind: operation.kind, phase: operation.phase, download: operation.download, install: operation.install } } }
    })
  }

  async function load(refresh = false): Promise<readonly WorkbenchPluginItem[]> {
    if (disposed) return []
    if (!reading || refresh) {
      if (reading) await reading.catch(() => undefined)
      const promise = read(refresh)
      reading = promise
      try { await promise } finally { if (reading === promise) reading = undefined }
    } else await reading
    return project()
  }

  async function run(id: string, kind: 'install' | 'update'): Promise<void> {
    const existing = pending.get(id)
    if (existing !== undefined) return existing.promise
    // Refresh first so an installation the Host already runs is adopted, never duplicated.
    await load(true)
    const adopted = pending.get(id)
    if (adopted !== undefined) return adopted.promise
    const entry = find(id)
    if (kind === 'install' ? installed.has(id) : !present(id)) return
    if (offline) throw new Error(kind === 'install' ? '请联网刷新工作台目录后安装' : '请联网刷新工作台目录后更新')
    const requestId = randomUUID() as PluginInstallRequestId
    const promise = (async () => {
      const result = kind === 'install'
        ? await ctx.remote.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId)
        : await ctx.remote.qingclawWorkbench.updateWorkbench(entry.packageName, entry.version, requestId)
      if (!result.ok) throw remoteFailure(result.error)
      await settle(id, result.value)
    })()
    track(id, { kind, phase: 'starting', download: 0, install: 0 }, requestId, promise)
    try { await promise } finally { forget(id) }
  }

  async function install(id: string): Promise<void> {
    return run(id, 'install')
  }

  async function update(id: string): Promise<void> {
    const existing = pending.get(id)
    if (existing !== undefined) return existing.promise
    if (!present(id)) return install(id)
    return run(id, 'update')
  }

  async function uninstall(id: string): Promise<void> {
    const existing = pending.get(id)
    if (existing !== undefined) return existing.promise
    const promise = (async () => {
      await load(true)
      const entry = find(id)
      if (!present(id)) return
      const result = await ctx.remote.pluginManager.removeBundle(entry.packageName)
      if (!result.ok) throw remoteFailure(result.error)
      const { application, error } = result.value
      if (application === 'failed' || application === 'cancelled') {
        throw new Error(error?.diagnostic ?? error?.code ?? application)
      }
      // The profile no longer owns it; the installed inventory may still list it until a restart.
      removed.add(id)
      restartRequired.delete(id)
      await load(true)
      notify()
    })()
    track(id, { kind: 'uninstall', phase: 'apply', download: 100, install: 100 }, undefined, promise)
    try { await promise } finally { forget(id) }
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const existing = pending.get(id)
    if (existing !== undefined) return existing.promise
    const promise = (async () => {
      await load(true)
      const entry = find(id)
      if (!present(id)) return
      const result = await ctx.remote.pluginManager.setBundleEnabled(entry.packageName, enabled)
      if (!result.ok) throw remoteFailure(result.error)
      const { application, error } = result.value
      if (application === 'failed' || application === 'cancelled') {
        throw new Error(error?.diagnostic ?? error?.code ?? application)
      }
      if (application === 'restart-required') restartRequired.add(id)
      await load(true)
      notify()
    })()
    track(id, { kind: 'toggle', phase: 'apply', download: 100, install: 100 }, undefined, promise)
    try { await promise } finally { forget(id) }
  }

  const byRequest = (requestId: PluginInstallRequestId | undefined): PendingOperation | undefined => {
    if (requestId === undefined) return undefined
    for (const operation of pending.values()) {
      if (operation.requestId === requestId) return operation
    }
    return undefined
  }

  const installState = (progress: PluginInstallProgress): void => {
    const operation = byRequest(progress.requestId)
    if (operation === undefined) return
    if (progress.phase === 'applying') patch(operation.id, { phase: 'apply', download: 100, install: 100 })
  }

  const installLog = (chunk: PluginInstallLogChunk): void => {
    const operation = byRequest(chunk.requestId)
    if (operation === undefined) return
    const progress = parseProgress(chunk.text)
    if (progress === undefined) return
    patch(operation.id, {
      phase: progress.added > 0 ? 'install' : 'download',
      download: Math.max(operation.download, progress.download),
      install: Math.max(operation.install, progress.install),
    })
  }

  const changed = (): void => { void load().then(notify, notify) }
  function clearSidebars(): void {
    for (const remove of sidebars.values()) remove()
    sidebars.clear()
  }
  const disposers = [
    ctx.remote.$on('plugin-manager/changed', changed),
    ctx.remote.$on('plugin-manager/install-state', installState),
    ctx.remote.$on('plugin-manager/install-log', installLog),
    ctx.slots.subscribe('main', () => { syncSidebars(); notify() }),
    ctx.slots.inject('sidebar.panellist', () => { syncSidebars(); return clearSidebars }),
  ]
  const storageChanged = (event: StorageEvent): void => {
    if (event.key === null || event.key === FAVORITES) notify()
  }
  window.addEventListener('storage', storageChanged)
  // Restore already-installed launchers and in-flight installations before the user opens the directory.
  void load().catch(() => undefined)
  return {
    load, snapshot: project, install, update, uninstall, setEnabled,
    async readReadme(id, version, language) {
      const entry = find(id)
      if (entry.version !== version) throw new Error('工作台版本已变更')
      if (installed.get(id) === version) {
        const answer = await ctx.remote.pluginManager.readBundleDetail(id, language, { npmFileSources: [] })
        if (!answer.ok) throw remoteFailure(answer.error)
        if (answer.value.status !== 'found') return null
        const { markdown, path } = answer.value
        return { markdown, resolveImage(destination) {
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(destination)) return undefined
          const query = new URLSearchParams({ bundle: id, document: path, path: destination })
          return new URL('api/plugin-manager/detail-file?' + query.toString(), document.baseURI).href
        } }
      }
      const answer = await ctx.remote.qingclawWorkbench.getWorkbenchReadme(id, version, language)
      if (!answer.ok) throw remoteFailure(answer.error)
      return answer.value === null ? null : { markdown: answer.value }
    },
    open(id) {
      const entry = find(id)
      if (!installed.has(id) || !hasMain(entry.panelId)) throw new Error('应用面板尚未加载')
      ctx.layout.selectPanel(entry.panelId as MainPanelId)
    },
    setFavorite(id, favorite) { find(id); updateId(storage, FAVORITES, id, favorite); notify() },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() {
      disposed = true
      disposers.forEach(dispose => dispose())
      window.removeEventListener('storage', storageChanged)
      listeners.clear()
      clearSidebars()
    },
  }
}
