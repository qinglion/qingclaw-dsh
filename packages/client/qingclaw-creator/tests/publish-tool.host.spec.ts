import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolActivationContext, ToolDefinition, ToolRegistrationOptions } from '@deepseek-ai/dsh-tools'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { create } from 'tar'
import { afterEach, expect, it, vi } from 'vitest'
import { publishPackage, registerPublishTool } from '../src/publish-tool.ts'
import { inspectArchive, registry } from '../src/publish-archive.ts'

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('libnpmpublish', () => ({ publish: upload }))
afterEach(() => { vi.unstubAllGlobals(); upload.mockReset() })

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'qingclaw-publish-')))
  const manifest = { name: '@qinglion/editor', version: '1.0.0', qingclaw: { resourceType: 'plugin' }, publishConfig: { tag: 'beta' } }
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))
  const archive = 'qinglion-editor-1.0.0.tgz'
  const stage = join(directory, 'packed')
  await mkdir(join(stage, 'package'), { recursive: true })
  await writeFile(join(stage, 'package/package.json'), JSON.stringify(manifest))
  await create({ cwd: stage, file: join(directory, archive), gzip: true }, ['package/package.json'])
  const bytes = await readFile(join(directory, archive))
  const target = { packageName: manifest.name, version: manifest.version, directory: '.', account: 'qc-11',
    archive, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }
  let token = 'desktop-grant'
  let known: string | undefined
  const ctx = {
    workspaceRegistry: { list: () => [{ id: 'workspace', path: directory, sessionIds: ['session'] }] },
    deepseekAccount: { getPlatformSession: async () => ({ token, origin: 'https://account.test', requestHeaders: {} }) },
  } as unknown as Context
  const password = 'qcn_' + 'x'.repeat(43)
  const grant = { username: 'qc-11', registry, password, expires_at: new Date(Date.now() + 120000).toISOString() }
  const fetch = vi.fn(async (input: URL | string, init: RequestInit) => {
    const url = new URL(input)
    if (url.host === 'account.test') {
      expect(new Headers(init.headers).get('x-dsh-auth-token')).toBe('desktop-grant')
      return Response.json(grant)
    }
    expect(url.origin).toBe('https://npm.qingclaw.com')
    expect(new Headers(init.headers).has('x-dsh-auth-token')).toBe(false)
    if (url.pathname.includes('/-/user/')) {
      expect(JSON.parse(String(init.body))).toMatchObject({ password, name: target.account })
      return Response.json({ token: 'test-bearer' })
    }
    return known ? Response.json({ name: manifest.name, versions: { '1.0.0': { dist: { integrity: known } } } })
      : new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  upload.mockImplementation(async () => { known = target.integrity })
  return { directory, ctx, grant, target, fetch, bytes, password, switchAccount: () => { token = 'another-grant' },
    setVersion: (integrity: string) => { known = integrity }, remove: () => rm(directory, { recursive: true, force: true }) }
}
const id = 'session' as SessionId
const signal = () => new AbortController().signal

it('publishes the captured archive with a scoped bearer, verifies it and leaves the old version untouched on retry', async () => {
  const f = await fixture()
  try {
    expect(await publishPackage(f.ctx, id, f.target, signal())).toMatchObject({ status: 'published', integrity: f.target.integrity })
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: f.target.packageName }), f.bytes,
      expect.objectContaining({ registry, '//npm.qingclaw.com/:_authToken': 'test-bearer', defaultTag: 'beta', redirect: 'error' }))
    expect(JSON.stringify(upload.mock.calls)).not.toContain(f.password)
    expect(await publishPackage(f.ctx, id, f.target, signal())).toMatchObject({ status: 'already_published' })
    f.setVersion('other-bytes')
    await expect(publishPackage(f.ctx, id, f.target, signal())).rejects.toThrow('版本已被其他内容占用')
    expect(upload).toHaveBeenCalledOnce()
  } finally { await f.remove() }
})

it('rejects expired grants, account changes and mismatched workspace membership before writing', async () => {
  const f = await fixture()
  try {
    await expect(publishPackage(f.ctx, 'other' as SessionId, f.target, signal())).rejects.toThrow('工作区')
    expect(f.fetch).not.toHaveBeenCalled()
    await expect(publishPackage(f.ctx, id, { ...f.target, account: 'qc-12' }, signal())).rejects.toThrow('账号已更改')
    f.grant.expires_at = new Date(0).toISOString()
    await expect(publishPackage(f.ctx, id, f.target, signal())).rejects.toThrow('到期')
    f.grant.expires_at = new Date(Date.now() + 60000).toISOString()
    f.fetch.mockImplementationOnce(async () => { f.switchAccount(); return Response.json(f.grant) })
    await expect(publishPackage(f.ctx, id, f.target, signal())).rejects.toThrow('账号已更改')
    expect(upload).not.toHaveBeenCalled()
  } finally { await f.remove() }
})

it('checks the archive name, content hash, archived manifest and project directory before requesting credentials', async () => {
  const f = await fixture()
  try {
    await expect(inspectArchive(f.directory, { ...f.target, archive: '../x.tgz' })).rejects.toThrow('文件名')
    await expect(inspectArchive(f.directory, { ...f.target, directory: '../' })).rejects.toThrow('工作区')
    await expect(inspectArchive(f.directory, { ...f.target, integrity: 'stale' })).rejects.toThrow('包内容已变更')
    if (process.platform !== 'win32') {
      await symlink(join(f.directory, f.target.archive), join(f.directory, 'other.tgz'))
      await expect(inspectArchive(f.directory, { ...f.target, archive: 'other.tgz' })).rejects.toThrow()
    }
    const manifest = { name: '@qinglion/other', version: '1.0.0' }
    await writeFile(join(f.directory, 'packed/package/package.json'), JSON.stringify(manifest))
    await create({ cwd: join(f.directory, 'packed'), file: join(f.directory, f.target.archive), gzip: true }, ['package/package.json'])
    const integrity = 'sha512-' + createHash('sha512').update(await readFile(join(f.directory, f.target.archive))).digest('base64')
    await expect(publishPackage(f.ctx, id, { ...f.target, integrity }, signal())).rejects.toThrow('归档清单')
    expect(f.fetch).not.toHaveBeenCalled()
  } finally { await f.remove() }
})

it('registers the tool for a signed-in creator in their plugin session and omits it for ordinary roles or other sessions', async () => {
  const f = await fixture()
  try {
    const register = vi.fn<(tool: ToolDefinition, options: ToolRegistrationOptions) => () => void>(() => () => {})
    let allowed = true
    const ctx = { workspaceRegistry: f.ctx.workspaceRegistry, tools: { register } } as unknown as Context
    registerPublishTool(ctx, async () => allowed)
    const [tool, { when }] = register.mock.calls[0]!
    expect(tool.name).toBe('qingclaw_publish_package')
    const activation = (sessionId: string) => ({ agent: { session: { id: sessionId } }, signal: signal() }) as ToolActivationContext
    expect(await when!(activation('session'))).toBe(true)
    allowed = false
    expect(await when!(activation('session'))).toBe(false)
    allowed = true
    expect(await when!(activation('another-session'))).toBe(false)
  } finally { await f.remove() }
})
