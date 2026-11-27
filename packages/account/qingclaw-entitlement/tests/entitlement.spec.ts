import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import type { PluginOperationId } from '@deepseek-ai/dsh-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import * as gate from '../src/index.ts'

interface Row {
  name: string
  installed: boolean
  enabled: boolean
  availability: 'installation' | 'profile' | 'missing'
}

interface FixtureOptions {
  readonly plan?: 'pro' | 'free'
  readonly subscriptionActive?: boolean
  readonly rows?: readonly Row[]
  readonly accountFails?: boolean
  readonly signedOut?: boolean
  readonly catalog?: readonly { readonly packageName: string; readonly title: string }[]
  readonly locked?: readonly string[]
  readonly cached?: { active: boolean; plan: string | null; endsAt: string | null; checkedAt: number }
}

function row(name: string, enabled: boolean, availability: Row['availability'] = 'profile'): Row {
  return { name, installed: true, enabled, availability }
}

async function fixture(options: FixtureOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'qingclaw-entitlement-'))
  const lockedFile = join(dir, 'locked.json')
  const licenceFile = join(dir, 'licence.json')
  const rows = (options.rows ?? [row('@qinglion/desk-a', true)]).map(item => ({ ...item }))
  let plan = options.plan ?? 'pro'
  let subscriptionActive = options.subscriptionActive ?? plan === 'pro'
  const setBundleEnabled = vi.fn(async (name: string, enabled: boolean) => {
    const bundle = rows.find(item => item.name === name)
    if (bundle === undefined) return { application: 'failed', error: { code: 'unknown-bundle' } }
    bundle.enabled = enabled
    return { application: 'applied' }
  })
  const ctx = new Context()
  ctx.provide('pluginManager', {
    listBundles: async () => rows.map(item => ({ ...item })),
    setBundleEnabled,
  })
  ctx.provide('deepseekAccount', {
    getPlatformSession: async () => options.signedOut === true ? null : { token: 'platform-token' },
    getProfile: async () => {
      if (options.accountFails === true) throw new Error('offline')
      return { status: 'ready' as const, value: { plan, subscriptionEndsAt: null, subscriptionActive } }
    },
  })
  if (options.catalog !== undefined) {
    ctx.provide('qingclawWorkbench', {
      getWorkbenchCatalog: async () => ({ entries: options.catalog }),
    })
  }
  if (options.locked !== undefined) {
    await writeFile(lockedFile, JSON.stringify({ version: 1, lockedAt: 1, bundles: options.locked }))
  }
  if (options.cached !== undefined) await writeFile(licenceFile, JSON.stringify(options.cached))
  await ctx.plugin(gate, { pollMs: 0, lockedFile, licenceFile, fallbackPrefix: '@qinglion/' })
  return {
    ctx, rows, setBundleEnabled, lockedFile, licenceFile,
    lapsed(): void { plan = 'free'; subscriptionActive = false; ctx.emit('plugin-manager/changed', { reason: 'plugin' }) },
    renewed(): void { plan = 'pro'; subscriptionActive = true; ctx.emit('plugin-manager/changed', { reason: 'plugin' }) },
    async dispose(): Promise<void> { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) },
  }
}

it('leaves workbenches enabled while the licence is professional', async () => {
  const f = await fixture()
  try {
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(f.setBundleEnabled).not.toHaveBeenCalled()
    expect(f.rows[0]?.enabled).toBe(true)
  } finally { await f.dispose() }
})

it('records the enabled workbenches and disables only those when the licence lapses', async () => {
  const f = await fixture({
    plan: 'free',
    rows: [
      row('@qinglion/desk-a', true),
      row('@qinglion/desk-b', false),
      row('@deepseek-ai/dsh-other', true),
    ],
  })
  try {
    await vi.waitFor(() => { expect(f.rows[0]?.enabled).toBe(false) })
    expect(f.rows[1]?.enabled).toBe(false)
    expect(f.rows[2]?.enabled).toBe(true)
    expect(JSON.parse(await readFile(f.lockedFile, 'utf8'))).toMatchObject({
      version: 1,
      bundles: ['@qinglion/desk-a'],
    })
  } finally { await f.dispose() }
})

it('restores only the recorded workbenches after renewal', async () => {
  const f = await fixture({
    plan: 'pro',
    locked: ['@qinglion/desk-a'],
    rows: [row('@qinglion/desk-a', false), row('@qinglion/desk-b', false)],
  })
  try {
    await vi.waitFor(() => { expect(f.rows[0]?.enabled).toBe(true) })
    expect(f.rows[1]?.enabled).toBe(false)
    await vi.waitFor(async () => {
      await expect(readFile(f.lockedFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    })
  } finally { await f.dispose() }
})

it('disables a workbench enabled while the licence is lapsed without adding it to the record', async () => {
  const f = await fixture({ plan: 'free', rows: [row('@qinglion/desk-a', true)] })
  try {
    await vi.waitFor(() => { expect(f.rows[0]?.enabled).toBe(false) })
    const first = JSON.parse(await readFile(f.lockedFile, 'utf8')) as { bundles: string[] }
    expect(first.bundles).toEqual(['@qinglion/desk-a'])
    const bundleRow = f.rows[0]
    if (bundleRow === undefined) throw new Error('missing row')
    bundleRow.enabled = true
    f.ctx.emit('plugin-manager/changed', { reason: 'plugin' })
    await vi.waitFor(() => { expect(bundleRow.enabled).toBe(false) })
    expect(JSON.parse(await readFile(f.lockedFile, 'utf8'))).toMatchObject({ bundles: ['@qinglion/desk-a'] })
  } finally { await f.dispose() }
})

it('locks the workbenches when nobody is signed in', async () => {
  const f = await fixture({ signedOut: true, rows: [row('@qinglion/desk-a', true)] })
  try {
    await vi.waitFor(() => { expect(f.rows[0]?.enabled).toBe(false) })
  } finally { await f.dispose() }
})

it('raises the upgrade prompt when a lapsed user enables a workbench', async () => {
  const f = await fixture({
    plan: 'free',
    rows: [row('@qinglion/desk-a', false)],
    catalog: [{ packageName: '@qinglion/desk-a', title: '自媒体工作台' }],
  })
  const seen: unknown[] = []
  f.ctx.on('qingclaw-entitlement/upgrade-required', (request) => { seen.push(request) })
  try {
    f.ctx.emit('plugin-manager/operation', {
      id: 'operation' as PluginOperationId,
      time: new Date().toISOString(),
      reason: 'bundle',
      target: '@qinglion/desk-a',
      stage: 'enable',
      enabled: true,
      phase: 'started',
    })
    await vi.waitFor(() => {
      expect(seen).toEqual([{ packageName: '@qinglion/desk-a', title: '自媒体工作台' }])
    })
  } finally { await f.dispose() }
})

it('keeps quiet when a professional account enables a workbench', async () => {
  const f = await fixture({ plan: 'pro', rows: [row('@qinglion/desk-a', false)] })
  const seen: unknown[] = []
  f.ctx.on('qingclaw-entitlement/upgrade-required', (request) => { seen.push(request) })
  try {
    f.ctx.emit('plugin-manager/operation', {
      id: 'operation' as PluginOperationId,
      time: new Date().toISOString(),
      reason: 'bundle',
      target: '@qinglion/desk-a',
      stage: 'enable',
      enabled: true,
      phase: 'started',
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(seen).toEqual([])
  } finally { await f.dispose() }
})

it('keeps quiet when a signed-out user enables a workbench', async () => {
  const f = await fixture({ signedOut: true, rows: [row('@qinglion/desk-a', false)] })
  const seen: unknown[] = []
  f.ctx.on('qingclaw-entitlement/upgrade-required', (request) => { seen.push(request) })
  try {
    f.ctx.emit('plugin-manager/operation', {
      id: 'operation' as PluginOperationId,
      time: new Date().toISOString(),
      reason: 'bundle',
      target: '@qinglion/desk-a',
      stage: 'enable',
      enabled: true,
      phase: 'started',
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(seen).toEqual([])
  } finally { await f.dispose() }
})

it('uses the cached licence when the account cannot answer', async () => {
  const f = await fixture({
    accountFails: true,
    cached: { active: true, plan: 'pro', endsAt: new Date(Date.now() + 86_400_000).toISOString(), checkedAt: 1 },
    rows: [row('@qinglion/desk-a', true)],
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(f.setBundleEnabled).not.toHaveBeenCalled()
  } finally { await f.dispose() }
})

it('locks from a cached licence whose period has ended', async () => {
  const f = await fixture({
    accountFails: true,
    cached: { active: true, plan: 'pro', endsAt: new Date(Date.now() - 1000).toISOString(), checkedAt: 1 },
    rows: [row('@qinglion/desk-a', true)],
  })
  try {
    await vi.waitFor(() => { expect(f.rows[0]?.enabled).toBe(false) })
  } finally { await f.dispose() }
})
