// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { expect, it, vi } from 'vitest'
import { compareVersions, createWorkbenchPluginStore } from '../src/client/workbench-plugin-store.ts'

const name = '@qinglion/dsh-desk'
const entry = { packageName: name, version: '2.0.0', panelId: 'desk', title: '工作台',
  description: '制作图文内容', author: '作者', category: '工具', registry: 'https://npm.qingclaw.com/' }

async function mount(installedVersion: () => string | undefined, enabled = () => true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const updateWorkbench = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }))
  const installWorkbench = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }))
  const removeBundle = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }))
  const setBundleEnabled = vi.fn(async (_name: string, _enabled: boolean) => ({ ok: true, value: { application: 'applied' } }))
  ctx.provide('remote', {
    $on: () => () => {},
    qingclawWorkbench: {
      getWorkbenchCatalog: async () => ({ ok: true, value: { entries: [entry], stale: false } }),
      getActiveInstalls: async () => ({ ok: true, value: [] }),
      installWorkbench,
      updateWorkbench,
    },
    pluginManager: {
      listBundles: async () => {
        const version = installedVersion()
        return { ok: true, value: version === undefined ? []
          : [{ name, version, installed: true, enabled: enabled(), availability: 'profile' }] }
      },
      removeBundle,
      setBundleEnabled,
      waitForInstall: async () => ({ ok: true, value: null }),
    },
  } as never)
  ctx.provide('layout', { selectPanel: vi.fn() } as never)
  const root = ctx.slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' } } } as never, () => null)
  const store = createWorkbenchPluginStore(ctx)
  return { ctx, store, root, updateWorkbench, installWorkbench, removeBundle, setBundleEnabled }
}

it('offers an update when the catalog is newer and installs it through the Host', async () => {
  let installedVersion: string | undefined = '1.9.0'
  const { ctx, store, root, updateWorkbench } = await mount(() => installedVersion)
  try {
    expect((await store.load())[0]).toMatchObject({
      installed: true, installedVersion: '1.9.0', updateAvailable: true,
    })

    updateWorkbench.mockImplementation(async () => {
      installedVersion = '2.0.0'
      return { ok: true, value: { application: 'applied' } }
    })
    await store.update(name)

    expect(updateWorkbench).toHaveBeenCalledWith(name, '2.0.0', expect.any(String))
    expect((await store.load())[0]).toMatchObject({
      installed: true, installedVersion: '2.0.0', updateAvailable: false,
    })
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('keeps a removed workbench uninstalled while the inventory still lists it', async () => {
  const { ctx, store, root, removeBundle } = await mount(() => '2.0.0')
  try {
    await store.uninstall(name)

    expect(removeBundle).toHaveBeenCalledWith(name)
    expect((await store.load())[0]).toMatchObject({
      installed: false, installable: true, updateAvailable: false,
    })
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('reports a disabled workbench and toggles it through the plugin manager', async () => {
  let enabled = false
  const { ctx, store, root, setBundleEnabled } = await mount(() => '2.0.0', () => enabled)
  try {
    expect((await store.load())[0]).toMatchObject({ installed: true, enabled: false })

    setBundleEnabled.mockImplementation(async (_name: string, next: boolean) => {
      enabled = next
      return { ok: true, value: { application: 'applied' } }
    })
    await store.setEnabled(name, true)

    expect(setBundleEnabled).toHaveBeenCalledWith(name, true)
    expect((await store.load())[0]).toMatchObject({ installed: true, enabled: true })
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('falls back to installing when an update targets a workbench the profile no longer has', async () => {
  const { ctx, store, root, updateWorkbench, installWorkbench } = await mount(() => undefined)
  try {
    await store.update(name)
    expect(updateWorkbench).not.toHaveBeenCalled()
    expect(installWorkbench).toHaveBeenCalledWith(name, '2.0.0', expect.any(String))
  } finally { store.dispose(); root(); await ctx.fiber.dispose() }
})

it('orders releases and prereleases like SemVer', () => {
  expect(compareVersions('1.9.0', '2.0.0')).toBeLessThan(0)
  expect(compareVersions('2.0.0-rc.1', '2.0.0')).toBeLessThan(0)
  expect(compareVersions('2.0.0-rc.2', '2.0.0-rc.10')).toBeLessThan(0)
  expect(compareVersions('2.0.0+build.1', '2.0.0')).toBe(0)
  expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
  expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
  expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBeGreaterThan(0)
  expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
  expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
  expect(compareVersions('1.0.0-alpha', '1.0.0-1')).toBeGreaterThan(0)
  expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
})
