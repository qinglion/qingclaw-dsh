import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDesktopCos } from '@deepseek-ai/dsh-desktop-publisher/desktop-cos.ts'
import { desktopPublishCos, desktopPublishCosWriter } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-cos.ts'
import { answer, cosError, startCosLoopback } from './cos-loopback.ts'
import { prepareWebsiteInstaller, uploadWebsiteInstaller } from '@deepseek-ai/dsh-desktop-publisher/desktop-website-installer.ts'
import type { DesktopRetainedManifest } from '@deepseek-ai/dsh-desktop-publisher/desktop-release-store.ts'
import type { DesktopPublishRoute } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-route.ts'

const roots: string[] = []
const productionOrigin = 'https://download.example.com'
const targets = ['mac-arm64', 'mac-x64', 'win-x64'] as const
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
function installerDisposition(version: string, target: DesktopPublishRoute['target']): string {
  return `attachment; filename="qingclaw-${version}-${target}.${target === 'win-x64' ? 'exe' : 'dmg'}"`
}
async function fixture(target: DesktopPublishRoute['target'] = 'mac-arm64') {
  const directory = await mkdtemp(join(tmpdir(), 'website-installer-'))
  roots.push(directory)
  const bytes = Buffer.from('final installer bytes')
  const route: DesktopPublishRoute = { runId: '12', attempt: '1', commit: 'a'.repeat(40), sourceRef: 'master',
    channel: 'nightly', runnerName: 'mini', runnerLabel: 'dsh-mini', target, preset: 'production' }
  const filename = `qingclaw-0.2.1-rc.5-${target}.${target === 'win-x64' ? 'exe' : 'dmg'}`
  await writeFile(join(directory, filename), bytes)
  const manifest: DesktopRetainedManifest = { schemaVersion: 1, source: {
    runId: route.runId, attempt: route.attempt, commit: route.commit, sourceRef: route.sourceRef,
    channel: route.channel, runnerName: route.runnerName, target: route.target, preset: route.preset, repository: 'owner/repo', workflowCommit: route.commit, productVersion: '0.2.1', version: '0.2.1-rc.5',
    testReleaseId: null, qualification: target === 'win-x64' ? 'signed' : 'notarized',
  }, files: [{ name: filename, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }] }
  return { directory, bytes, route, manifest }
}

it.each(targets)('accepts only the final %s installer without any update files or current checkout version', async (target) => {
  const f = await fixture(target)
  f.manifest = { ...f.manifest, files: [...f.manifest.files,
    { name: 'missing-update.zip', size: 1, sha512: 'unused' }, { name: 'nightly.yml', size: 1, sha512: 'unused' }] }
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  try {
    expect(installer.plan.version).toBe('0.2.1-rc.5')
    expect(installer.plan.artifacts).toHaveLength(1)
    expect(installer.digest).toEqual({ size: f.bytes.length, sha512: f.manifest.files[0]!.sha512 })
  } finally { await installer.handle.close() }
})

it('rejects changed installer bytes', async () => {
  const f = await fixture()
  await writeFile(join(f.directory, f.manifest.files[0]!.name), 'wrong bytes')
  await expect(prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)).rejects.toThrow('differs from build manifest')
})

it('rejects a selected build without a semantic version before opening its installer', async () => {
  const f = await fixture()
  const manifest = { ...f.manifest, source: { ...f.manifest.source, version: 'not-semver' } }
  await expect(prepareWebsiteInstaller(f.directory, manifest, f.route, 'owner/repo', 'production-123', productionOrigin))
    .rejects.toThrow('selected build has an invalid semantic version')
})

it.each(['preset', 'qualification', 'attempt', 'commit', 'target', 'repository', 'runId', 'runnerName', 'sourceRef', 'channel'] as const)('rejects mismatched %s even when file bytes match', async (field) => {
  const f = await fixture()
  const source = { ...f.manifest.source }
  if (field === 'preset') source.preset = 'test'
  if (field === 'qualification') source.qualification = 'unnotarized'
  if (field === 'attempt') source.attempt = '2'
  if (field === 'commit') source.commit = 'b'.repeat(40)
  if (field === 'target') source.target = 'mac-x64'
  if (field === 'repository') source.repository = 'other/repo'
  if (field === 'runId') source.runId = '13'
  if (field === 'runnerName') source.runnerName = 'other'
  if (field === 'sourceRef') source.sourceRef = 'dsh-v0.2.1'
  if (field === 'channel') source.channel = 'stable'
  await expect(prepareWebsiteInstaller(f.directory, { ...f.manifest, source }, f.route, 'owner/repo', 'production-123', productionOrigin)).rejects.toThrow('identity or production qualification mismatch')
})

it.each(['absent', 'missing-header', 'wrong-header', 'header-not-retained'] as const)('reconciles %s after audit failure without repeating the fixed-object PUT', async (initial) => {
  const f = await fixture()
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  let stored: Buffer | undefined = initial === 'absent' ? undefined : f.bytes
  const disposition = installerDisposition(f.manifest.source.version, f.route.target)
  let storedDisposition = initial === 'wrong-header' ? 'attachment; filename="old.dmg"' : undefined
  const server = await startCosLoopback((request, response) => {
    if (request.method === 'PUT') {
      expect(request.headers['x-cos-forbid-overwrite']).toBeUndefined()
      expect(request.headers['content-md5']).toBe(createHash('md5').update(f.bytes).digest('base64'))
      expect(request.headers['content-disposition']).toBe(disposition)
      storedDisposition = disposition
      stored = request.body
      answer(response)
    } else if (stored) answer(response, 200, stored, storedDisposition && initial !== 'header-not-retained' ? { 'content-disposition': storedDisposition } : {})
    else answer(response, 404, cosError('NoSuchKey'))
  })
  try {
    const credentials = { secretId: 'fixture-id', secretKey: 'fixture-key' }
    const createClient: typeof createDesktopCos = (credentials) => {
      const client = createDesktopCos(credentials)
      server.redirect(client)
      return client
    }
    const transport = desktopPublishCos(installer.plan, credentials, createClient)
    const writer = desktopPublishCosWriter(installer.plan, credentials, createClient)
    await expect(uploadWebsiteInstaller(installer, transport, writer, async (event) => {
      if (event === 'uploaded') throw new Error('audit unavailable')
    })).rejects.toThrow(initial === 'header-not-retained' ? 'remote download filename unconfirmed' : 'audit unavailable')
    if (initial === 'header-not-retained') {
      expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(1)
      return
    }
    const events: string[] = []
    expect(await uploadWebsiteInstaller(installer, transport, writer, async (event) => { events.push(event) })).toBe('present')
    expect(events).toEqual(['uploaded'])
    expect(stored).toEqual(f.bytes)
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(1)
  } finally { await installer.handle.close(); await server.close() }
})

it.each(targets)('allows %s to replace only a strictly older fixed installer', async (target) => {
  const f = await fixture(target)
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  let remote = { size: 3, sha512: 'older', contentDisposition: installerDisposition('0.2.1-rc.4', target) }
  let puts = 0
  const events: string[] = []
  try {
    const outcome = await uploadWebsiteInstaller(installer, { read: async () => remote }, { put: async (upload) => {
      puts++
      for await (const _bytes of upload.body) { /* consume the verified stream */ }
      remote = { ...installer.digest, contentDisposition: upload.contentDisposition }
    } }, async (event) => { events.push(event) })
    expect(outcome).toBe('uploaded')
    expect(puts).toBe(1)
    expect(events).toEqual(['upload-intent', 'uploaded'])
    expect(remote.contentDisposition).toBe(installerDisposition('0.2.1-rc.5', target))
  } finally { await installer.handle.close() }
})

it.each(targets.flatMap(target => [
  { target, name: 'newer', disposition: installerDisposition('0.2.1-rc.6', target), error: 'refusing downgrade' },
  { target, name: 'same-version different', disposition: installerDisposition('0.2.1-rc.5', target), error: 'different remote bytes' },
  { target, name: 'missing-metadata', disposition: undefined, error: 'no trusted version metadata' },
  { target, name: 'invalid-metadata', disposition: installerDisposition('not-semver', target), error: 'no trusted version metadata' },
]))('rejects a $name $target fixed installer before recording or PUT', async ({ target, disposition, error }) => {
  const f = await fixture(target)
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  try {
    await expect(uploadWebsiteInstaller(installer,
      { read: async () => ({ size: 3, sha512: 'different', ...(disposition ? { contentDisposition: disposition } : {}) }) },
      { put: async () => { throw new Error('unexpected PUT') } },
      async () => { throw new Error('unexpected publication event') })).rejects.toThrow(error)
  } finally { await installer.handle.close() }
})

it.each(targets)('does not relabel identical %s bytes as an older version', async (target) => {
  const f = await fixture(target)
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  try {
    await expect(uploadWebsiteInstaller(installer,
      { read: async () => ({ ...installer.digest, contentDisposition: installerDisposition('0.2.1-rc.6', target) }) },
      { put: async () => { throw new Error('unexpected PUT') } },
      async () => { throw new Error('unexpected publication event') })).rejects.toThrow('refusing downgrade')
  } finally { await installer.handle.close() }
})

it('does not replace changed bytes when recovering an already completed publication', async () => {
  const f = await fixture()
  const installer = await prepareWebsiteInstaller(f.directory, f.manifest, f.route, 'owner/repo', 'production-123', productionOrigin)
  try {
    await expect(uploadWebsiteInstaller(installer,
      { read: async () => ({ size: 1, sha512: 'different' }) }, { put: async () => { throw new Error('unexpected PUT') } },
      async () => { throw new Error('unexpected write intent') }, { previouslyUploaded: true })).rejects.toThrow('recorded upload no longer matches')
  } finally { await installer.handle.close() }
})

it('rejects an unsupported source ref even when route and manifest agree', async () => {
  const f = await fixture()
  const route = { ...f.route, sourceRef: 'feature/unapproved' }
  const manifest = { ...f.manifest, source: { ...f.manifest.source, sourceRef: route.sourceRef } }
  await expect(prepareWebsiteInstaller(f.directory, manifest, route, 'owner/repo', 'production-123', productionOrigin)).rejects.toThrow('identity or production qualification mismatch')
})
