// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { expect, it, vi } from 'vitest'
import { createWorkbenchPluginStore, needsSignIn } from '../src/client/workbench-plugin-store.ts'
import type { WorkbenchInstallResult } from '../src/types.ts'

/** One Host answer as the Remote boundary delivers it. */
type Answer<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

it('installs the exact private package, opens a registered panel, and restores favorites and launchers on reload', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const entry = { packageName: '@qinglion/dsh-media-desk', version: '2.7.2', panelId: 'media-desk', title: '自媒体工作台',
    description: '创作', category: '工具', author: 'QingClaw', registry: 'https://npm.qingclaw.com/' }
  let installed = false
  let installedVersion = entry.version
  const installWorkbench = vi.fn(async (): Promise<Answer<WorkbenchInstallResult>> => {
    installed = true
    return { ok: true, value: { application: 'applied' } }
  })
  let offline = false
  const getWorkbenchCatalog = vi.fn(async () => ({ ok: true, value: { entries: [entry], stale: offline } }))
  const getWorkbenchReadme = vi.fn(async (): Promise<Answer<string>> => ({ ok: true, value: 'private registry document' }))
  const readBundleDetail = vi.fn(async () => ({ ok: true, value: { status: 'found', path: 'README.md', markdown: 'installed document' } }))
  ctx.provide('remote', { $on: () => () => {}, qingclawWorkbench: { getWorkbenchCatalog, getWorkbenchReadme, installWorkbench,
    getActiveInstalls: async () => ({ ok: true, value: [] }) }, pluginManager: {
    readBundleDetail, waitForInstall: async () => ({ ok: true, value: null }),
    listBundles: async () => ({ ok: true, value: installed ? [{ name: entry.packageName, version: installedVersion, installed: true, availability: 'profile' }] : [] }),
  } } as never)
  const selectPanel = vi.fn()
  ctx.provide('layout', { selectPanel } as never)
  const root = ctx.slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' } } } as never, () => null)
  window.localStorage.clear()
  let store = createWorkbenchPluginStore(ctx)
  try {
    expect((await store.load())[0]).toMatchObject({ installed: false, openable: false })
    await expect(store.install('dsh-native-workbench')).rejects.toThrow()
    expect(installWorkbench).not.toHaveBeenCalled()
    expect(await store.readReadme(entry.packageName, entry.version, 'zh')).toEqual({ markdown: 'private registry document' })
    expect(getWorkbenchReadme).toHaveBeenCalledWith(entry.packageName, entry.version, 'zh')
    await expect(store.readReadme(entry.packageName, '0.0.1', 'zh')).rejects.toThrow()
    offline = true
    expect((await store.load())[0]?.installable).toBe(false)
    await expect(store.install(entry.packageName)).rejects.toThrow('请联网')
    expect(installWorkbench).not.toHaveBeenCalled()
    offline = false
    // The Host reports a missing sign-in, and the store keeps the code for the UI to act on.
    installWorkbench.mockResolvedValueOnce({ ok: false, error: { code: 'qingclaw-workbench/sign-in-required', message: 'Sign in' } })
    const refused = await store.install(entry.packageName).catch((error: unknown) => error)
    expect(needsSignIn(refused)).toBe(true)
    expect(needsSignIn(new Error('other'))).toBe(false)
    getWorkbenchReadme.mockResolvedValueOnce({ ok: false, error: { code: 'qingclaw-workbench/sign-in-required', message: 'Sign in' } })
    const unreadable = await store.readReadme(entry.packageName, entry.version, 'zh').catch((error: unknown) => error)
    expect(needsSignIn(unreadable)).toBe(true)
    installWorkbench.mockResolvedValueOnce({ ok: true, value: { application: 'failed', diagnostic: '私服拒绝安装' } })
    await expect(store.install(entry.packageName)).rejects.toThrow('私服拒绝安装')
    await store.install(entry.packageName)
    expect(installWorkbench).toHaveBeenLastCalledWith(entry.packageName, entry.version, expect.any(String))
    expect(await store.readReadme(entry.packageName, entry.version, 'zh')).toMatchObject({ markdown: 'installed document' })
    expect(readBundleDetail).toHaveBeenCalledWith(entry.packageName, 'zh', { npmFileSources: [] })
    installedVersion = '2.6.0'
    await store.load()
    expect(await store.readReadme(entry.packageName, entry.version, 'zh')).toEqual({ markdown: 'private registry document' })
    expect(readBundleDetail).toHaveBeenCalledTimes(1)
    expect(() => store.open(entry.packageName)).toThrow()
    const panel = ctx.slots.register({ name: 'main', key: entry.panelId } as never, () => null)
    expect((await store.load())[0]).toMatchObject({ installed: true, openable: true })
    store.open(entry.packageName)
    expect(selectPanel).toHaveBeenCalledWith(entry.panelId)
    store.setFavorite(entry.packageName, true)
    expect(ctx.slots.entriesOfSlot('sidebar.panellist')).toHaveLength(1)
    store.dispose()
    offline = true
    store = createWorkbenchPluginStore(ctx)
    expect((await store.load())[0]).toMatchObject({ favorite: true, installed: true, openable: true })
    expect(ctx.slots.entriesOfSlot('sidebar.panellist').map(e => e.options.id)).toEqual([entry.panelId])
    panel()
  } finally { store.dispose(); root(); window.localStorage.clear(); await ctx.fiber.dispose() }
})

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((setter) => { resolve = setter })
  return { promise, resolve }
}

const progressEntry = { packageName: '@qinglion/dsh-desk', version: '1.0.0', panelId: 'desk', title: 'Desk',
  description: '', category: '', author: '', registry: 'https://npm.qingclaw.com/' }

/** A Host whose install progress events and active-install recovery the test drives. */
async function mountProgress(options: {
  active?: () => readonly { name: string; version: string; kind: 'install' | 'update'; requestId: string }[]
  wait?: () => Promise<unknown>
  stale?: () => boolean
  catalog?: () => Promise<unknown>
  bundles?: () => Promise<unknown>
  activeDelay?: Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  let installed = false
  const handlers = new Map<string, (payload: never) => void>()
  const installWorkbench = vi.fn(async (_name: string, _version: string, _requestId: string): Promise<Answer<WorkbenchInstallResult>> =>
    ({ ok: true, value: { application: 'applied' } }))
  type ManagementAnswer = {
    ok: boolean
    value?: { application: string; error?: { code?: string; diagnostic?: string } }
    error?: { code: string; message: string }
  }
  const management = async (): Promise<ManagementAnswer> => ({ ok: true, value: { application: 'applied' } })
  const removeBundle = vi.fn(management)
  const setBundleEnabled = vi.fn(management)
  const updateWorkbench = vi.fn(management)
  type DetailAnswer = {
    ok: boolean
    value?: { status: string; path?: string; markdown?: string }
    error?: { code: string; message: string }
  }
  const readBundleDetail = vi.fn(async (): Promise<DetailAnswer> =>
    ({ ok: true, value: { status: 'found', path: 'README.md', markdown: 'doc' } }))
  const getWorkbenchReadme = vi.fn(async (): Promise<{ ok: boolean; value: string | null }> => ({ ok: true, value: 'registry doc' }))
  ctx.provide('remote', {
    $on: (event: string, handler: (payload: never) => void) => { handlers.set(event, handler); return () => { handlers.delete(event) } },
    qingclawWorkbench: {
      getWorkbenchCatalog: options.catalog ?? (async () => ({
        ok: true, value: { entries: [progressEntry], stale: options.stale?.() ?? false } })),
      getActiveInstalls: async () => { const value = options.active?.() ?? []; await options.activeDelay; return { ok: true, value } },
      getWorkbenchReadme,
      installWorkbench,
      updateWorkbench,
    },
    pluginManager: {
      listBundles: options.bundles ?? (async () => ({ ok: true, value: installed
        ? [{ name: progressEntry.packageName, version: progressEntry.version, installed: true, availability: 'profile' }] : [] })),
      waitForInstall: async () => ({ ok: true, value: await (options.wait?.() ?? Promise.resolve(null)) }),
      readBundleDetail,
      removeBundle,
      setBundleEnabled,
    },
  } as never)
  ctx.provide('layout', { selectPanel: vi.fn() } as never)
  const root = ctx.slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' } } } as never, () => null)
  const store = createWorkbenchPluginStore(ctx)
  const emit = (event: string, payload: unknown): void => { handlers.get(event)?.(payload as never) }
  const chunk = (requestId: string, text: string) =>
    ({ requestId, jobId: 'job', argv: ['pnpm', 'add'], cwd: '/profile', stream: 'stderr', text })
  return { ctx, store, root, installWorkbench, updateWorkbench, removeBundle, setBundleEnabled,
    readBundleDetail, getWorkbenchReadme, emit, chunk,
    setInstalled: (value: boolean) => { installed = value } }
}

it('keeps install progress in the store across page switches and deduplicates clicks', async () => {
  const gate = deferred<Answer<WorkbenchInstallResult>>()
  const { ctx, store, root, installWorkbench, emit, chunk, setInstalled } = await mountProgress()
  installWorkbench.mockImplementation(() => gate.promise)
  try {
    await store.load()
    const installing = store.install(progressEntry.packageName)
    await vi.waitFor(() => expect(installWorkbench).toHaveBeenCalledTimes(1))
    expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'install', phase: 'starting', download: 0, install: 0 })
    void store.install(progressEntry.packageName)
    await Promise.resolve()
    expect(installWorkbench).toHaveBeenCalledTimes(1)
    const requestId = installWorkbench.mock.calls[0]?.[2] ?? ''
    emit('plugin-manager/install-log', chunk(requestId, 'Progress: resolved 10, reused 2, downloaded 3, added 0'))
    expect(store.snapshot()[0]?.pending).toMatchObject({ phase: 'download', download: 50, install: 0 })
    emit('plugin-manager/install-log', chunk(requestId, 'pnpm add running'))
    emit('plugin-manager/install-log', chunk(requestId, 'Progress: resolved 0, reused 0, downloaded 0, added 0'))
    emit('plugin-manager/install-log', chunk('other', 'Progress: resolved 10, reused 10, downloaded 0, added 10'))
    emit('plugin-manager/install-state', { requestId: 'other', phase: 'applying' })
    emit('plugin-manager/install-state', { requestId, phase: 'installing' })
    expect(store.snapshot()[0]?.pending).toMatchObject({ phase: 'download', download: 50 })
    emit('plugin-manager/install-log', chunk(requestId, 'Progress: resolved 10, reused 5, downloaded 5, added 4'))
    expect(store.snapshot()[0]?.pending).toMatchObject({ phase: 'install', download: 100, install: 40 })
    emit('plugin-manager/install-log', chunk(requestId, 'Progress: resolved 10, reused 1, downloaded 1, added 1'))
    expect(store.snapshot()[0]?.pending).toMatchObject({ download: 100, install: 40 })
    emit('plugin-manager/install-state', { requestId, phase: 'applying' })
    expect(store.snapshot()[0]?.pending).toMatchObject({ phase: 'apply', download: 100, install: 100 })
    setInstalled(true)
    gate.resolve({ ok: true, value: { application: 'applied' } })
    await installing
    expect(store.snapshot()[0]?.pending).toBeUndefined()
    expect(store.snapshot()[0]?.installed).toBe(true)
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('adopts an installation the Host still runs and settles it through waitForInstall', async () => {
  const wait = deferred<unknown>()
  let active = true
  const { ctx, store, root, emit, chunk, setInstalled } = await mountProgress({
    active: () => active ? [{ name: progressEntry.packageName, version: '1.0.0', kind: 'install', requestId: 'req-1' }] : [],
    wait: () => wait.promise,
  })
  try {
    await store.load()
    expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'install', phase: 'starting' })
    emit('plugin-manager/install-log', chunk('req-1', 'Progress: resolved 4, reused 0, downloaded 2, added 0'))
    expect(store.snapshot()[0]?.pending).toMatchObject({ phase: 'download', download: 50 })
    setInstalled(true)
    active = false
    wait.resolve({ application: 'applied', changed: true, stage: 'install', target: progressEntry.packageName })
    await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toBeUndefined())
    expect(store.snapshot()[0]?.installed).toBe(true)
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('clears an adopted installation that failed or vanished without a second install', async () => {
  for (const outcome of [{ application: 'failed', error: { diagnostic: 'registry refused' } }, null]) {
    const wait = deferred<unknown>()
    let active = true
    const { ctx, store, root, installWorkbench } = await mountProgress({
      active: () => active ? [{ name: progressEntry.packageName, version: '1.0.0', kind: 'update', requestId: 'req-2' }] : [],
      wait: () => wait.promise,
    })
    try {
      await store.load()
      expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'update' })
      active = false
      wait.resolve(outcome)
      await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toBeUndefined())
      expect(installWorkbench).not.toHaveBeenCalled()
    } finally { store.dispose(); root(); await ctx.fiber.dispose() }
  }
})

it('shows uninstall and toggle operations as pending while they run', async () => {
  const gate = deferred<{ ok: true; value: { application: string } }>()
  const { ctx, store, root, removeBundle, setBundleEnabled, setInstalled } = await mountProgress()
  try {
    setInstalled(true)
    await store.load()
    removeBundle.mockImplementation(() => gate.promise)
    const removing = store.uninstall(progressEntry.packageName)
    await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'uninstall', phase: 'apply' }))
    gate.resolve({ ok: true, value: { application: 'applied' } })
    await removing
    expect(store.snapshot()[0]?.pending).toBeUndefined()
    const toggling = deferred<{ ok: true; value: { application: string } }>()
    setBundleEnabled.mockImplementation(() => toggling.promise)
    const switching = store.setEnabled(progressEntry.packageName, false)
    await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'toggle' }))
    toggling.resolve({ ok: true, value: { application: 'applied' } })
    await switching
    expect(store.snapshot()[0]?.pending).toBeUndefined()
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('refuses an update while the catalog is offline', async () => {
  let stale = false
  const { ctx, store, root, setInstalled } = await mountProgress({ stale: () => stale })
  try {
    setInstalled(true)
    await store.load(true)
    stale = true
    await expect(store.update(progressEntry.packageName)).rejects.toThrow('请联网刷新工作台目录后更新')
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('surfaces catalog and inventory failures and ignores answers after dispose', async () => {
  for (const overrides of [{ catalog: async () => ({ ok: false, error: { message: 'catalog down' } }) },
    { bundles: async () => ({ ok: false, error: { message: 'inventory down' } }) }]) {
    const { ctx, store, root } = await mountProgress(overrides)
    try {
      await expect(store.load(true)).rejects.toThrow(overrides.catalog ? 'catalog down' : 'inventory down')
    } finally { store.dispose(); root(); await ctx.fiber.dispose() }
  }
  const gate = deferred<undefined>()
  let asked = false
  const { ctx, store, root } = await mountProgress({
    activeDelay: gate.promise,
    active: () => { asked = true; return [] },
  })
  try {
    const reading = store.load(true)
    await vi.waitFor(() => expect(asked).toBe(true))
    store.dispose()
    gate.resolve(undefined)
    await reading
    expect(await store.load(false)).toEqual([])
  } finally { root(); await ctx.fiber.dispose() }
  const bundlesGate = deferred<unknown>()
  const late = await mountProgress({ bundles: () => bundlesGate.promise })
  try {
    const early = late.store.load()
    late.store.dispose()
    bundlesGate.resolve({ ok: true, value: [] })
    expect(await early).toEqual([])
  } finally { late.root(); await late.ctx.fiber.dispose() }
})

it('reports restart-required installations on the row', async () => {
  const { ctx, store, root, installWorkbench, setInstalled } = await mountProgress()
  try {
    installWorkbench.mockImplementation(async () => {
      setInstalled(true)
      return { ok: true, value: { application: 'restart-required' } }
    })
    await store.install(progressEntry.packageName)
    expect(store.snapshot()[0]).toMatchObject({ installed: true, restartRequired: true })
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('adopts an active install discovered during the install refresh', async () => {
  const wait = deferred<unknown>()
  let active = true
  const { ctx, store, root, installWorkbench } = await mountProgress({
    active: () => active ? [{ name: progressEntry.packageName, version: '1.0.0', kind: 'install', requestId: 'req-3' }] : [],
    wait: () => wait.promise,
  })
  try {
    const installing = store.install(progressEntry.packageName)
    await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toMatchObject({ kind: 'install' }))
    expect(installWorkbench).not.toHaveBeenCalled()
    active = false
    wait.resolve({ application: 'applied', changed: true, stage: 'install', target: progressEntry.packageName })
    await installing
    expect(store.snapshot()[0]?.pending).toBeUndefined()
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('reuses a pending operation for install and update clicks', async () => {
  const wait = deferred<unknown>()
  let active = true
  const { ctx, store, root, installWorkbench, updateWorkbench } = await mountProgress({
    active: () => active ? [{ name: progressEntry.packageName, version: '1.0.0', kind: 'install', requestId: 'req-4' }] : [],
    wait: () => wait.promise,
  })
  try {
    await store.load()
    void store.install(progressEntry.packageName)
    void store.update(progressEntry.packageName)
    await Promise.resolve()
    expect(installWorkbench).not.toHaveBeenCalled()
    expect(updateWorkbench).not.toHaveBeenCalled()
    active = false
    wait.resolve({ application: 'applied', changed: true, stage: 'install', target: progressEntry.packageName })
    await vi.waitFor(() => expect(store.snapshot()[0]?.pending).toBeUndefined())
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('resolves an update whose refresh shows the workbench removed', async () => {
  const { ctx, store, root, updateWorkbench, setInstalled } = await mountProgress()
  try {
    setInstalled(true)
    await store.load(true)
    setInstalled(false)
    await store.update(progressEntry.packageName)
    expect(updateWorkbench).not.toHaveBeenCalled()
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('deduplicates and reports uninstall and toggle failures', async () => {
  const { ctx, store, root, removeBundle, setBundleEnabled, setInstalled } = await mountProgress()
  try {
    setInstalled(true)
    await store.load(true)
    setBundleEnabled.mockResolvedValue({ ok: false, error: { code: 'x', message: 'toggle refused' } })
    await expect(store.setEnabled(progressEntry.packageName, true)).rejects.toThrow('toggle refused')
    setBundleEnabled.mockResolvedValue({ ok: true, value: { application: 'failed', error: { code: 'operation-error' } } })
    await expect(store.setEnabled(progressEntry.packageName, true)).rejects.toThrow('operation-error')
    setBundleEnabled.mockResolvedValue({ ok: true, value: { application: 'restart-required' } })
    await store.setEnabled(progressEntry.packageName, false)
    expect(store.snapshot()[0]?.restartRequired).toBe(true)
    removeBundle.mockResolvedValue({ ok: false, error: { code: 'x', message: 'remove refused' } })
    await expect(store.uninstall(progressEntry.packageName)).rejects.toThrow('remove refused')
    removeBundle.mockResolvedValue({ ok: true, value: { application: 'failed', error: { diagnostic: 'restore failed' } } })
    await expect(store.uninstall(progressEntry.packageName)).rejects.toThrow('restore failed')
    const gate = deferred<{ ok: true; value: { application: string } }>()
    removeBundle.mockImplementation(() => gate.promise)
    const first = store.uninstall(progressEntry.packageName)
    await vi.waitFor(() => expect(removeBundle).toHaveBeenCalledTimes(3))
    void store.uninstall(progressEntry.packageName)
    void store.setEnabled(progressEntry.packageName, true)
    await Promise.resolve()
    expect(removeBundle).toHaveBeenCalledTimes(3)
    gate.resolve({ ok: true, value: { application: 'applied' } })
    await first
    await store.setEnabled(progressEntry.packageName, true)
    expect(setBundleEnabled).toHaveBeenCalledTimes(3)
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('reads installed documents, resolves relative images, and restores favorites safely', async () => {
  const { ctx, store, root, readBundleDetail, getWorkbenchReadme, setInstalled, emit } = await mountProgress()
  try {
    window.localStorage.setItem('qingclaw.workbench.favorites.v1', '{invalid')
    setInstalled(true)
    const overlap = [store.load(), store.load(true)]
    await Promise.all(overlap)
    expect(store.snapshot()[0]?.favorite).toBe(false)
    readBundleDetail.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'detail refused' } })
    await expect(store.readReadme(progressEntry.packageName, '1.0.0', 'zh')).rejects.toThrow('detail refused')
    readBundleDetail.mockResolvedValueOnce({ ok: true, value: { status: 'none' } })
    expect(await store.readReadme(progressEntry.packageName, '1.0.0', 'zh')).toBeNull()
    const doc = await store.readReadme(progressEntry.packageName, '1.0.0', 'zh')
    expect(doc?.resolveImage?.('https://example.com/a.png')).toBeUndefined()
    expect(doc?.resolveImage?.('img/a.png')).toContain('api/plugin-manager/detail-file')
    getWorkbenchReadme.mockResolvedValueOnce({ ok: true, value: null })
    setInstalled(false)
    await store.load(true)
    expect(await store.readReadme(progressEntry.packageName, '1.0.0', 'zh')).toBeNull()
    store.setFavorite(progressEntry.packageName, true)
    store.setFavorite(progressEntry.packageName, false)
    expect(store.snapshot()[0]?.favorite).toBe(false)
    let notified = 0
    const unsubscribe = store.subscribe(() => { notified += 1 })
    emit('plugin-manager/changed', { reason: 'install' })
    await vi.waitFor(() => expect(notified).toBeGreaterThan(0))
    window.dispatchEvent(new StorageEvent('storage', { key: 'qingclaw.workbench.favorites.v1' }))
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    expect(notified).toBe(3)
    unsubscribe()
    const panel = ctx.slots.register({ name: 'main', key: progressEntry.panelId } as never, () => null)
    setInstalled(true)
    await store.load(true)
    expect(ctx.slots.entriesOfSlot('sidebar.panellist')).toHaveLength(1)
    panel()
    await store.load(true)
    expect(ctx.slots.entriesOfSlot('sidebar.panellist')).toHaveLength(0)
  } finally { store.dispose(); root(); window.localStorage.clear(); await ctx.fiber.dispose() }
})
