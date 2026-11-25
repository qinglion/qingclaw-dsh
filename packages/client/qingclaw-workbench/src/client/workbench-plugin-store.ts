import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import type { WorkbenchCatalogEntry } from '../types.ts'
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
}

export interface WorkbenchReadmeDocument {
  readonly markdown: string
  readonly resolveImage?: (destination: string) => string | undefined
}

export interface WorkbenchPluginStore {
  readReadme(id: string, version: string, language: string): Promise<WorkbenchReadmeDocument | null>
  load(refresh?: boolean): Promise<readonly WorkbenchPluginItem[]>
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

/** Project the official directory, actual Host inventory and registered main panels. */
export function createWorkbenchPluginStore(ctx: Context, storage: Storage = window.localStorage): WorkbenchPluginStore {
  const listeners = new Set<() => void>()
  const sidebars = new Map<string, () => void>()
  const installs = new Map<string, Promise<void>>()
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
  }

  async function load(refresh = false): Promise<readonly WorkbenchPluginItem[]> {
    if (disposed) return []
    if (!reading || refresh) {
      if (reading) await reading.catch(() => undefined)
      const promise = read(refresh)
      reading = promise
      try { await promise } finally { if (reading === promise) reading = undefined }
    } else await reading
    const favorites = readIds(storage, FAVORITES)
    return entries.map((entry) => {
      const has = present(entry.packageName)
      const installedVersion = has ? installed.get(entry.packageName) : undefined
      const openable = has && hasMain(entry.panelId)
      return { ...entry, id: entry.packageName, installed: has, installable: !has && !offline, openable,
        enabled: !has || enabledBundles.has(entry.packageName),
        favorite: favorites.has(entry.packageName),
        updateAvailable: has && managed.has(entry.packageName) && installedVersion !== undefined
          && compareVersions(installedVersion, entry.version) < 0,
        ...(installedVersion === undefined ? {} : { installedVersion }),
        restartRequired: has && !openable && restartRequired.has(entry.packageName) }
    })
  }

  async function install(id: string): Promise<void> {
    if (installs.has(id)) return installs.get(id)
    const pending = (async () => {
      await load(true)
      const entry = find(id)
      if (installed.has(id)) return
      if (offline) throw new Error('请联网刷新工作台目录后安装')
      // The Host authorizes the private registry read, so the registry token never reaches the browser.
      const result = await ctx.remote.qingclawWorkbench.installWorkbench(entry.packageName, entry.version)
      if (!result.ok) throw remoteFailure(result.error)
      if (result.value.application === 'failed' || result.value.application === 'cancelled' || result.value.application === 'overridden') {
        throw new Error(result.value.diagnostic ?? result.value.application)
      }
      if (result.value.application === 'restart-required') restartRequired.add(id)
      await load()
      notify()
    })()
    installs.set(id, pending)
    try { await pending } finally { installs.delete(id) }
  }

  async function update(id: string): Promise<void> {
    if (installs.has(id)) return installs.get(id)
    const pending = (async () => {
      await load(true)
      const entry = find(id)
      if (!present(id)) return install(id)
      if (offline) throw new Error('请联网刷新工作台目录后更新')
      const result = await ctx.remote.qingclawWorkbench.updateWorkbench(entry.packageName, entry.version)
      if (!result.ok) throw remoteFailure(result.error)
      if (result.value.application === 'failed' || result.value.application === 'cancelled'
        || result.value.application === 'overridden') {
        throw new Error(result.value.diagnostic ?? result.value.application)
      }
      if (result.value.application === 'restart-required') restartRequired.add(id)
      await load(true)
      notify()
    })()
    installs.set(id, pending)
    try { await pending } finally { installs.delete(id) }
  }

  async function uninstall(id: string): Promise<void> {
    if (installs.has(id)) return installs.get(id)
    const pending = (async () => {
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
    installs.set(id, pending)
    try { await pending } finally { installs.delete(id) }
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    if (installs.has(id)) return installs.get(id)
    const pending = (async () => {
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
    installs.set(id, pending)
    try { await pending } finally { installs.delete(id) }
  }

  const changed = (): void => { void load().then(notify, notify) }
  function clearSidebars(): void {
    for (const remove of sidebars.values()) remove()
    sidebars.clear()
  }
  const disposers = [
    ctx.remote.$on('plugin-manager/changed', changed),
    ctx.slots.subscribe('main', () => { syncSidebars(); notify() }),
    ctx.slots.inject('sidebar.panellist', () => { syncSidebars(); return clearSidebars }),
  ]
  const storageChanged = (event: StorageEvent): void => {
    if (event.key === null || event.key === FAVORITES) notify()
  }
  window.addEventListener('storage', storageChanged)
  // Restore already-installed launchers before the user opens the directory.
  void load().catch(() => undefined)
  return {
    load, install, update, uninstall, setEnabled,
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
