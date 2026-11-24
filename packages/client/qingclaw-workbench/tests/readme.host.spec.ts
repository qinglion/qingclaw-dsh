import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { create } from 'tar'
import { expect, it, vi } from 'vitest'
import QingClawWorkbench from '../src/index.ts'
import { readRegistryReadme } from '../src/readme.ts'
import type { WorkbenchCatalogEntry } from '../src/types.ts'

const entry: WorkbenchCatalogEntry = {
  packageName: '@qinglion/desk', version: '1.0.0', registry: 'https://npm.qingclaw.com/',
  panelId: 'desk', title: 'Desk', author: 'QingClaw', category: '', description: '',
}

/** The platform's read grant for one signed-in account, as the workbench Host exchanges it. */
const grant = {
  username: 'qc-1', password: 'qcn_' + 'a'.repeat(43), registry: 'https://npm.qingclaw.com/',
  expires_at: new Date(Date.now() + 600_000).toISOString(),
}

it('reads the exact package README or localized detail under native plugin rules', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-readme-'))
  try {
    await mkdir(join(temp, 'package/locale'), { recursive: true })
    await writeFile(join(temp, 'package/package.json'), JSON.stringify({ name: entry.packageName, version: entry.version }))
    await writeFile(join(temp, 'package/README.md'), '# README')
    await writeFile(join(temp, 'package/locale/zh.json'), JSON.stringify({ meta: { detail: 'details.md' } }))
    await writeFile(join(temp, 'package/details.md'), '---\ntitle: test\n---\n# 中文说明')
    const archive = join(temp, 'fixture.tgz')
    await create({ cwd: temp, file: archive, gzip: true }, ['package/package.json', 'package/README.md', 'package/locale/zh.json', 'package/details.md'])
    const bytes = await readFile(archive)
    const provider = vi.fn(async () => new Response(new Uint8Array(bytes)))
    vi.stubGlobal('fetch', provider)
    const signal = new AbortController().signal
    expect(await readRegistryReadme(entry, 'zh-CN', signal, 'registry-token')).toContain('# 中文说明')
    expect(await readRegistryReadme(entry, 'en', signal, 'registry-token')).toBe('# README')
    expect(provider).toHaveBeenCalledWith(new URL('https://npm.qingclaw.com/@qinglion/desk/-/desk-1.0.0.tgz'),
      expect.objectContaining({ credentials: 'omit', redirect: 'error', headers: { authorization: 'Bearer registry-token' } }))
    await expect(readRegistryReadme({ ...entry, version: '2.0.0' }, 'en', signal, 'registry-token')).rejects.toThrow('identity mismatch')
    provider.mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': String(26 * 1024 * 1024) } }))
    await expect(readRegistryReadme(entry, 'en', signal, 'registry-token')).rejects.toThrow('byte limit')
    // A slower npm archive can still supply the version's README after the catalog timeout.
    const ctx = new Context()
    try {
      ctx.provide('deepseekAccount', { getPlatformSession: async () => ({ origin: 'https://qingclaw.com', token: 'platform-token' }) })
      await ctx.plugin(QingClawWorkbench, { feedUrl: 'https://qingclaw.com/api/workbench-feed',
        cacheTtlMs: 300_000, fetchTimeoutMs: 5, maxResponseBytes: 64 * 1024 })
      const asked: string[] = []
      vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url, options) => {
        asked.push(String(url))
        if (String(url).endsWith('/workbenches/index.json')) return Response.json({ schemaVersion: 1, workbenches: [entry] })
        if (String(url).endsWith('/auth-api/v0/dsh/registry/read-grant')) {
          expect(options?.headers).toMatchObject({ 'X-DSH-Auth-Token': 'platform-token' })
          return Response.json(grant)
        }
        if (String(url).includes('/-/user/org.couchdb.user:')) return Response.json({ token: 'registry-token' })
        await delay(30, undefined, { signal: options?.signal ?? undefined })
        return new Response(new Uint8Array(bytes))
      }))
      expect(await ctx.qingclawWorkbench.getWorkbenchReadme(entry.packageName, entry.version, 'en')).toBe('# README')
      expect(asked).toContain('https://npm.qingclaw.com/-/user/org.couchdb.user:qc-1')
    } finally {
      await ctx.fiber.dispose()
    }
  } finally {
    vi.unstubAllGlobals()
    await rm(temp, { recursive: true, force: true })
  }
})
