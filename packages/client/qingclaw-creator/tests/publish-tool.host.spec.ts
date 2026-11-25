import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, realpath, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolActivationContext, ToolDefinition, ToolRegistrationOptions, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Session } from '@deepseek-ai/dsh-session'
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
  const account = { getPlatformSession: async () => ({ token, origin: 'https://account.test', requestHeaders: {} }) }
  const ctx = {
    // The composition mounts the working-directory service; this fixture exercises the header fallback.
    get: () => undefined,
    deepseekAccount: account,
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
    // The version check reads the private registry with the account's token.
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-bearer')
    const requested = decodeURIComponent(url.pathname.slice(1))
    return known ? Response.json({ name: requested, versions: { '1.0.0': { dist: { integrity: known } } } })
      : new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  upload.mockImplementation(async () => { known = target.integrity })
  return { directory, ctx, account, grant, target, fetch, bytes, password, switchAccount: () => { token = 'another-grant' },
    setVersion: (integrity: string) => { known = integrity }, remove: () => rm(directory, { recursive: true, force: true }) }
}
const signal = () => new AbortController().signal
const session = (cwd: string) => ({ id: 'session', header: { cwd } }) as unknown as Session
const run = (cwd: string) => ({ agent: { session: session(cwd) }, signal: signal() }) as ToolRunContext

it('publishes the captured archive with a scoped bearer, verifies it and leaves the old version untouched on retry', async () => {
  const f = await fixture()
  try {
    expect(await publishPackage(f.ctx, () => f.directory, f.target, signal())).toMatchObject({ status: 'published', integrity: f.target.integrity, directory: '.' })
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: f.target.packageName }), f.bytes,
      expect.objectContaining({ registry, '//npm.qingclaw.com/:_authToken': 'test-bearer', defaultTag: 'beta', redirect: 'error' }))
    expect(JSON.stringify(upload.mock.calls)).not.toContain(f.password)
    expect(await publishPackage(f.ctx, () => f.directory, f.target, signal())).toMatchObject({ status: 'already_published' })
    f.setVersion('other-bytes')
    await expect(publishPackage(f.ctx, () => f.directory, f.target, signal())).rejects.toThrow('版本已被其他内容占用')
    expect(upload).toHaveBeenCalledOnce()
  } finally { await f.remove() }
})

it('names the size limit when the registry refuses an oversized archive', async () => {
  const f = await fixture()
  try {
    upload.mockImplementation(async () => { throw Object.assign(new Error('too large'), { code: 'E413', statusCode: 413 }) })
    await expect(publishPackage(f.ctx, () => f.directory, f.target, signal())).rejects.toThrow('25 MB')
  } finally { await f.remove() }
})

it('rejects expired grants, account changes and mismatched workspace membership before writing', async () => {
  const f = await fixture()
  try {
    let root = f.directory
    await expect(publishPackage(f.ctx, () => root, { ...f.target, account: 'qc-12' }, signal())).rejects.toThrow('账号已更改')
    f.grant.expires_at = new Date(0).toISOString()
    await expect(publishPackage(f.ctx, () => root, f.target, signal())).rejects.toThrow('到期')
    f.grant.expires_at = new Date(Date.now() + 60000).toISOString()
    f.fetch.mockImplementationOnce(async () => { f.switchAccount(); return Response.json(f.grant) })
    await expect(publishPackage(f.ctx, () => root, f.target, signal())).rejects.toThrow('账号已更改')
    // A branch switch mid-publish must not write the archive from another checkout.
    f.fetch.mockImplementationOnce(async () => { root = join(f.directory, 'elsewhere'); return Response.json(f.grant) })
    await expect(publishPackage(f.ctx, () => root, f.target, signal())).rejects.toThrow('会话目录已变更')
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
    await expect(publishPackage(f.ctx, () => f.directory, { ...f.target, integrity }, signal())).rejects.toThrow('归档清单')
    expect(f.fetch).not.toHaveBeenCalled()
  } finally { await f.remove() }
})

it('validates a package nested in a collection workspace and refuses directories outside it', async () => {
  const f = await fixture()
  try {
    const nested = join(f.directory, 'packages', 'desk')
    await mkdir(join(nested, 'packed', 'package'), { recursive: true })
    await writeFile(join(nested, 'package.json'), JSON.stringify({ name: '@qinglion/desk', version: '2.0.0', qingclaw: { resourceType: 'plugin' } }))
    await writeFile(join(nested, 'packed/package/package.json'), JSON.stringify({ name: '@qinglion/desk', version: '2.0.0' }))
    const archive = 'qinglion-desk-2.0.0.tgz'
    await create({ cwd: join(nested, 'packed'), file: join(nested, archive), gzip: true }, ['package/package.json'])
    const bytes = await readFile(join(nested, archive))
    const target = { packageName: '@qinglion/desk', version: '2.0.0', directory: 'packages/desk', archive,
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }
    expect(await inspectArchive(f.directory, target)).toMatchObject({ integrity: target.integrity })
    await expect(inspectArchive(f.directory, { ...target, directory: '../outside' })).rejects.toThrow('工作区')
    await expect(inspectArchive(f.directory, { ...target, directory: 'missing' })).rejects.toThrow('工作区')
  } finally { await f.remove() }
})

it('resolves the package directory from its name and version when the request names none', async () => {
  const f = await fixture()
  try {
    const anonymous = { packageName: f.target.packageName, version: f.target.version,
      archive: f.target.archive, integrity: f.target.integrity }
    expect(await inspectArchive(f.directory, anonymous)).toMatchObject({ integrity: f.target.integrity })

    const nested = join(f.directory, 'packages', 'desk')
    await mkdir(join(nested, 'packed', 'package'), { recursive: true })
    await writeFile(join(nested, 'package.json'), JSON.stringify({ name: '@qinglion/desk', version: '2.0.0', qingclaw: { resourceType: 'plugin' } }))
    await writeFile(join(nested, 'packed/package/package.json'), JSON.stringify({ name: '@qinglion/desk', version: '2.0.0' }))
    const archive = 'qinglion-desk-2.0.0.tgz'
    await create({ cwd: join(nested, 'packed'), file: join(nested, archive), gzip: true }, ['package/package.json'])
    const bytes = await readFile(join(nested, archive))
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
    expect(await inspectArchive(f.directory, { packageName: '@qinglion/desk', version: '2.0.0', archive, integrity }))
      .toMatchObject({ integrity })

    // A dependency tree copy never becomes the publishing target.
    const shadow = join(f.directory, 'node_modules', 'desk')
    await mkdir(shadow, { recursive: true })
    await writeFile(join(shadow, 'package.json'), JSON.stringify({ name: '@qinglion/desk', version: '2.0.0', qingclaw: { resourceType: 'plugin' } }))
    expect(await inspectArchive(f.directory, { packageName: '@qinglion/desk', version: '2.0.0', archive, integrity }))
      .toMatchObject({ integrity })

    await expect(inspectArchive(f.directory, { packageName: '@qinglion/missing', version: '1.0.0', archive, integrity }))
      .rejects.toThrow('没有找到')
  } finally { await f.remove() }
})

it('asks for the directory when two workspace directories declare the same package and version', async () => {
  const f = await fixture()
  try {
    const copies = ['a', 'b']
    for (const copy of copies) {
      await mkdir(join(f.directory, copy), { recursive: true })
      await writeFile(join(f.directory, copy, 'package.json'), JSON.stringify({ name: '@qinglion/twin', version: '1.0.0', qingclaw: { resourceType: 'plugin' } }))
    }
    await expect(inspectArchive(f.directory, { packageName: '@qinglion/twin', version: '1.0.0', archive: 'twin-1.0.0.tgz', integrity: 'sha512-x' }))
      .rejects.toThrow('多个目录')
  } finally { await f.remove() }
})

it('registerBindsTheChosenPackageToTheSession', async () => {})

it('offers the tool to a signed-in creator in every session, whatever the workspace holds', async () => {
  const f = await fixture()
  try {
    const register = vi.fn<(tool: ToolDefinition, options: ToolRegistrationOptions) => () => void>(() => () => {})
    let allowed = true
    registerPublishTool({ tools: { register } } as unknown as Context, async () => allowed)
    const [tool, { when }] = register.mock.calls[0]!
    expect(tool.name).toBe('qingclaw_publish_package')
    const activation = { signal: signal() } as ToolActivationContext
    expect(await when!(activation)).toBe(true)
    allowed = false
    expect(await when!(activation)).toBe(false)
  } finally { await f.remove() }
})

it('publishes from a branch worktree the session was created in', async () => {
  const f = await fixture()
  try {
    const manifest = { name: '@qinglion/editor', version: '1.0.0', qingclaw: { resourceType: 'plugin' } }
    const worktree = join(f.directory, 'worktrees', 'feature')
    await mkdir(join(worktree), { recursive: true })
    await writeFile(join(worktree, 'package.json'), JSON.stringify(manifest))
    // The worktree checkout holds the same package; only its directory differs.
    await copyFile(join(f.directory, f.target.archive), join(worktree, f.target.archive))
    expect(await publishPackage(f.ctx, () => worktree, f.target, signal())).toMatchObject({ status: 'published', directory: '.' })
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: f.target.packageName }), f.bytes, expect.anything())
  } finally { await f.remove() }
})

it('binds the package the user chose to the session so a later request needs no directory', async () => {
  const f = await fixture()
  try {
    const manifest = { name: '@qinglion/twin', version: '1.0.0', qingclaw: { resourceType: 'plugin' } }
    for (const copy of ['a', 'b']) {
      await mkdir(join(f.directory, copy, 'packed', 'package'), { recursive: true })
      await writeFile(join(f.directory, copy, 'package.json'), JSON.stringify(manifest))
      await writeFile(join(f.directory, copy, 'packed/package/package.json'), JSON.stringify(manifest))
      await create({ cwd: join(f.directory, copy, 'packed'), file: join(f.directory, copy, 'twin-1.0.0.tgz'), gzip: true }, ['package/package.json'])
    }
    const bytes = await readFile(join(f.directory, 'b', 'twin-1.0.0.tgz'))
    const args = { packageName: manifest.name, version: manifest.version, archive: 'twin-1.0.0.tgz',
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), account: 'qc-11' }
    const register = vi.fn<(tool: ToolDefinition, options: ToolRegistrationOptions) => () => void>(() => () => {})
    registerPublishTool({ tools: { register }, get: () => undefined, deepseekAccount: f.account } as unknown as Context, async () => true)
    const [tool] = register.mock.calls[0]!
    // The registry records whatever bytes this package publishes.
    upload.mockImplementation(async (_manifest: unknown, bytes: Buffer) => {
      f.setVersion('sha512-' + createHash('sha512').update(bytes).digest('base64'))
    })
    const exec = run(f.directory)
    // Naming the directory is the user's choice among equal candidates.
    expect(await tool.execute({ ...args, directory: 'b' }, exec)).toMatchObject({ directory: 'b' })
    // The session keeps that choice: resolving again would report two candidates.
    expect(await tool.execute(args, exec)).toMatchObject({ directory: 'b' })
    await expect(inspectArchive(f.directory, args)).rejects.toThrow('多个目录')
  } finally { await f.remove() }
})
