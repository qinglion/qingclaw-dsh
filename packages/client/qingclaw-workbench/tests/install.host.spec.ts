import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import type { PluginInstallRequestId } from '@deepseek-ai/dsh-plugin-manager/types'
import QingClawWorkbench from '../src/index.ts'
import type { WorkbenchCatalogEntry } from '../src/types.ts'

const requestId = 'host-spec-request' as PluginInstallRequestId

const entry: WorkbenchCatalogEntry = {
  packageName: '@qinglion/desk', version: '1.0.0', registry: 'https://npm.qingclaw.com/',
  panelId: 'desk', title: 'Desk', author: 'QingClaw', category: '', description: '',
}

/** The platform's read grant for one signed-in account. */
const grant = {
  username: 'qc-2', password: 'qcn_' + 'c'.repeat(43), registry: 'https://npm.qingclaw.com/',
  expires_at: new Date(Date.now() + 600_000).toISOString(),
}

/** A Host with a listed workbench, one installation implementation, and the account grant it exchanges. */
async function fixture(options: {
  install?: (spec: string, settings: unknown) => Promise<unknown>
  manager?: boolean
  entries?: WorkbenchCatalogEntry[]
  plan?: 'pro' | 'free'
} = {}) {
  const ctx = new Context()
  const installBundle = vi.fn(options.install ?? (async () => ({ application: 'applied', changed: true })))
  ctx.provide('deepseekAccount', {
    getPlatformSession: async () => ({ origin: 'https://qingclaw.com', token: 'platform-token' }),
    getProfile: async () => ({ status: 'ready', value: { plan: options.plan ?? 'pro', subscriptionEndsAt: null } }),
  })
  if (options.manager !== false) ctx.provide('pluginManager', { installBundle })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/workbenches/index.json')) {
      return Response.json({ schemaVersion: 1, workbenches: options.entries ?? [entry] })
    }
    if (String(url).endsWith('/auth-api/v0/dsh/registry/read-grant')) return Response.json(grant)
    if (String(url).includes('/-/user/org.couchdb.user:')) return Response.json({ token: 'registry-bearer' })
    return new Response(null, { status: 404 })
  }))
  await ctx.plugin(QingClawWorkbench, { feedUrl: 'https://qingclaw.com/api/workbench-feed',
    cacheTtlMs: 300_000, fetchTimeoutMs: 5, maxResponseBytes: 64 * 1024 })
  return { ctx, installBundle }
}

it('installs one listed version through the native manager with the account registry token', async () => {
  const { ctx, installBundle } = await fixture()
  try {
    expect(await ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId)).toEqual({ application: 'applied' })
    expect(installBundle).toHaveBeenCalledWith('https://npm.qingclaw.com/@qinglion/desk/-/desk-1.0.0.tgz', {
      enabled: true, saveExact: true, registry: entry.registry,
      expected: { name: entry.packageName, version: entry.version }, authToken: 'registry-bearer', requestId,
    })
  } finally { vi.unstubAllGlobals(); await ctx.fiber.dispose() }
})

it('lets a free account browse but refuses to install without the professional licence', async () => {
  const { ctx, installBundle } = await fixture({ plan: 'free' })
  try {
    expect(await ctx.qingclawWorkbench.getWorkbenchCatalog(false)).toMatchObject({
      entries: [expect.objectContaining({ packageName: entry.packageName })],
    })
    await expect(ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId))
      .rejects.toMatchObject({ code: 'qingclaw-workbench/pro-required' })
    expect(installBundle).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals(); await ctx.fiber.dispose() }
})

it('hands other product plugins the account token for private-registry reads', async () => {
  const { ctx } = await fixture()
  try {
    const authorization = await ctx.qingclawWorkbench.registryAuthorization(entry.registry)
    expect(authorization.token).toBe('registry-bearer')
    expect(authorization.expiresAt).toBeGreaterThan(Date.now())
  } finally { vi.unstubAllGlobals(); await ctx.fiber.dispose() }
})

it('reports the installation outcome the catalog hides, including why it did not apply', async () => {
  const restart = await fixture({ install: async () => ({ application: 'restart-required', changed: true }) })
  try {
    expect(await restart.ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId))
      .toEqual({ application: 'restart-required' })
  } finally { vi.unstubAllGlobals(); await restart.ctx.fiber.dispose() }
  const diagnosed = await fixture({ install: async () => ({ application: 'failed', changed: false,
    error: { code: 'not-bundle', diagnostic: 'package declares no bundle' } }) })
  try {
    expect(await diagnosed.ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId))
      .toEqual({ application: 'failed', diagnostic: 'package declares no bundle' })
  } finally { vi.unstubAllGlobals(); await diagnosed.ctx.fiber.dispose() }
  // A coded failure without a diagnostic reports the code.
  const coded = await fixture({ install: async () => ({ application: 'cancelled', changed: false, error: { code: 'invalid-spec' } }) })
  try {
    expect(await coded.ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId))
      .toEqual({ application: 'cancelled', diagnostic: 'invalid-spec' })
  } finally { vi.unstubAllGlobals(); await coded.ctx.fiber.dispose() }
})

it('exposes an in-flight installation so a reloaded client can recover it', async () => {
  let release!: (value: { application: string }) => void
  const gate = new Promise<{ application: string }>((resolve) => { release = resolve })
  const { ctx, installBundle } = await fixture({ install: () => gate })
  try {
    const pending = ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId)
    await vi.waitFor(async () => {
      expect(await ctx.qingclawWorkbench.getActiveInstalls()).toEqual([
        { name: entry.packageName, version: entry.version, kind: 'install', requestId },
      ])
    })
    expect(installBundle).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requestId }))
    release({ application: 'applied' })
    expect(await pending).toEqual({ application: 'applied' })
    expect(await ctx.qingclawWorkbench.getActiveInstalls()).toEqual([])
  } finally { vi.unstubAllGlobals(); await ctx.fiber.dispose() }
})

it('refuses a registry configuration that carries credentials or a query', async () => {
  const rejected: [string, string][] = [['https://user:pass@npm.example/', 'registry must not contain credentials'],
    ['https://npm.example/?x=1', 'registry must not carry a query']]
  for (const [registry, message] of rejected) {
    const ctx = new Context()
    await expect(ctx.plugin(QingClawWorkbench, { registry, feedUrl: 'https://qingclaw.com/api/workbench-feed',
      cacheTtlMs: 300_000, fetchTimeoutMs: 5, maxResponseBytes: 64 * 1024 }))
      .rejects.toThrow(message)
    await ctx.fiber.dispose()
  }
})

it('installs nothing the directory does not list, and reports a Host that cannot install', async () => {
  const { ctx } = await fixture()
  try {
    await expect(ctx.qingclawWorkbench.installWorkbench(entry.packageName, '9.9.9', requestId)).rejects.toThrow('Unknown workbench version')
    await expect(ctx.qingclawWorkbench.installWorkbench('@qinglion/missing', entry.version, requestId)).rejects.toThrow('Unknown workbench version')
  } finally { vi.unstubAllGlobals(); await ctx.fiber.dispose() }
  const unsupported = await fixture({ manager: false })
  try {
    await expect(unsupported.ctx.qingclawWorkbench.installWorkbench(entry.packageName, entry.version, requestId))
      .rejects.toThrow('当前运行环境不支持安装工作台')
  } finally { vi.unstubAllGlobals(); await unsupported.ctx.fiber.dispose() }
  vi.unstubAllGlobals()
})
