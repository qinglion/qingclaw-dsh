import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import type { WorkbenchCatalogEntry } from '../types.ts'
import { WorkbenchPanelIcon } from './WorkbenchPanelIcon.tsx'

export interface WorkbenchPluginItem extends WorkbenchCatalogEntry {
  readonly id: string
  readonly iconUrl?: string
  readonly installed: boolean
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
  open(id: string): void
  setFavorite(id: string, favorite: boolean): void
  subscribe(listener: () => void): () => void
  dispose(): void
}

const FAVORITES = 'qingclaw.workbench.favorites.v1'

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
  let entries: readonly WorkbenchCatalogEntry[] = []
  let offline = false
  let installed = new Map<string, string | undefined>()
  let reading: Promise<void> | undefined
  let disposed = false
  const notify = (): void => { if (!disposed) for (const listener of listeners) listener() }
  const hasMain = (id: string): boolean => ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === id)
  const hasSidebar = (id: string): boolean => ctx.slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === id)

  function syncSidebars(): void {
    const shown = entries.filter(entry => installed.has(entry.packageName) && hasMain(entry.panelId))
    const keep = new Set(shown.map(entry => entry.panelId))
    for (const [id, remove] of sidebars) {
      if (!keep.has(id)) { sidebars.delete(id); remove() }
    }
    for (const entry of shown) {
      // Existing plugins retain ownership of any launcher they registered.
      if (!ctx.slots.spec('sidebar.panellist') || hasSidebar(entry.panelId)) continue
      sidebars.set(entry.panelId, ctx.slots.register({ name: 'sidebar.panellist', id: entry.panelId as MainPanelId,
        label: entry.title }, WorkbenchPanelIcon))
    }
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
      const present = installed.has(entry.packageName)
      const openable = present && hasMain(entry.panelId)
      return { ...entry, id: entry.packageName, installed: present, installable: !present && !offline, openable,
        favorite: favorites.has(entry.packageName),
        restartRequired: present && !openable && restartRequired.has(entry.packageName) }
    })
  }

  async function install(id: string): Promise<void> {
    if (installs.has(id)) return installs.get(id)
    const pending = (async () => {
      await load(true)
      const entry = find(id)
      if (installed.has(id)) return
      if (offline) throw new Error('请联网刷新工作台目录后安装')
      // Pin the package transport to Verdaccio even if the Host has a fallback
      // registry for dependencies. Native installation verifies the manifest.
      const leaf = entry.packageName.split('/')[1]
      const archive = new URL(`${entry.packageName}/-/${leaf}-${entry.version}.tgz`, entry.registry).href
      const result = await ctx.remote.pluginManager.installBundle(archive, {
        registry: entry.registry, enabled: true, saveExact: true, expected: { name: id, version: entry.version },
      })
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'cancelled' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.error?.code ?? result.value.application)
      }
      if (result.value.application === 'restart-required') restartRequired.add(id)
      await load()
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
    load, install,
    async readReadme(id, version, language) {
      const entry = find(id)
      if (entry.version !== version) throw new Error('工作台版本已变更')
      if (installed.get(id) === version) {
        const answer = await ctx.remote.pluginManager.readBundleDetail(id, language)
        if (!answer.ok) throw new Error(answer.error.message)
        if (answer.value.status !== 'found') return null
        const { markdown, path } = answer.value
        return { markdown, resolveImage(destination) {
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(destination)) return undefined
          const query = new URLSearchParams({ bundle: id, document: path, path: destination })
          return new URL('api/plugin-manager/detail-file?' + query.toString(), document.baseURI).href
        } }
      }
      const answer = await ctx.remote.qingclawWorkbench.getWorkbenchReadme(id, version, language)
      if (!answer.ok) throw new Error(answer.error.message)
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
