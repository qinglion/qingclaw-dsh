// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { expect, it, vi } from 'vitest'
import { createWorkbenchPluginStore } from '../src/client/workbench-plugin-store.ts'

it('installs the exact private package, opens a registered panel, and restores favorites and launchers on reload', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const entry = { packageName: '@qinglion/dsh-media-desk', version: '2.7.2', panelId: 'media-desk', title: '自媒体工作台',
    description: '创作', category: '工具', author: 'QingClaw', registry: 'https://npm.qingclaw.com/' }
  let installed = false
  let installedVersion = entry.version
  const installBundle = vi.fn(async () => { installed = true; return { ok: true, value: { application: 'applied' } } })
  let offline = false
  const getWorkbenchCatalog = vi.fn(async () => ({ ok: true, value: { entries: [entry], stale: offline } }))
  const getWorkbenchReadme = vi.fn(async () => ({ ok: true, value: 'private registry document' }))
  const readBundleDetail = vi.fn(async () => ({ ok: true, value: { status: 'found', path: 'README.md', markdown: 'installed document' } }))
  ctx.provide('remote', { $on: () => () => {}, qingclawWorkbench: { getWorkbenchCatalog, getWorkbenchReadme }, pluginManager: {
    installBundle, readBundleDetail, listBundles: async () => ({ ok: true, value: installed ? [{ name: entry.packageName, version: installedVersion, installed: true, availability: 'profile' }] : [] }),
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
    expect(installBundle).not.toHaveBeenCalled()
    expect(await store.readReadme(entry.packageName, entry.version, 'zh')).toEqual({ markdown: 'private registry document' })
    expect(getWorkbenchReadme).toHaveBeenCalledWith(entry.packageName, entry.version, 'zh')
    await expect(store.readReadme(entry.packageName, '0.0.1', 'zh')).rejects.toThrow()
    offline = true
    expect((await store.load())[0]?.installable).toBe(false)
    await expect(store.install(entry.packageName)).rejects.toThrow('请联网')
    expect(installBundle).not.toHaveBeenCalled()
    offline = false
    await store.install(entry.packageName)
    expect(installBundle).toHaveBeenCalledWith('https://npm.qingclaw.com/@qinglion/dsh-media-desk/-/dsh-media-desk-2.7.2.tgz',
      expect.objectContaining({ expected: { name: entry.packageName, version: '2.7.2' }, enabled: true }))
    expect(await store.readReadme(entry.packageName, entry.version, 'zh')).toMatchObject({ markdown: 'installed document' })
    expect(readBundleDetail).toHaveBeenCalledWith(entry.packageName, 'zh')
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
