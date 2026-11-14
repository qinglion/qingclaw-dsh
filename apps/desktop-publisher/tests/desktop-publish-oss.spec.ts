import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type OSS from 'ali-oss'
import { expect, it } from 'vitest'
import { desktopArtifactDigest } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish.ts'
import { desktopPublishOss, desktopPublishOssWriter, type DesktopOssClient } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-oss.ts'
import type { DesktopUploadPlan } from '@deepseek-ai/dsh-desktop-publisher/desktop-upload-types.ts'

interface StoredObject { readonly bytes: Buffer; readonly headers: Record<string, string> }

function fixtureClient(objects = new Map<string, StoredObject>(), beforePut?: () => Promise<void>) {
  const puts: Array<{ key: string; options: OSS.PutStreamOptions }> = []
  const client: DesktopOssClient = {
    async getStream(key = '') {
      const object = objects.get(key)
      if (!object) throw Object.assign(new Error('missing'), { code: 'NoSuchKey', status: 404 })
      return { stream: Readable.from([object.bytes]), res: { status: 200, headers: object.headers,
        size: object.bytes.length, rt: 1 } }
    },
    async putStream(key, source, options = {} as OSS.PutStreamOptions) {
      await beforePut?.()
      const chunks: Buffer[] = []
      for await (const bytes of source as AsyncIterable<Buffer | Uint8Array | string>) chunks.push(Buffer.from(bytes))
      const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)]))
      objects.set(key, { bytes: Buffer.concat(chunks), headers })
      puts.push({ key, options })
      return { name: key, res: { status: 200, headers: {}, size: 0, rt: 1 } }
    },
  }
  return { client, objects, puts }
}

it('publishes immutable binaries and mutable feeds through OSS with exact remote reconciliation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-oss-'))
  try {
    const binary = join(root, 'setup.exe')
    await writeFile(binary, 'signed-binary')
    const plan: DesktopUploadPlan = {
      environment: 'production', target: 'win-x64', version: '1.2.3', commit: 'a'.repeat(40), dirty: false,
      bucket: 'qingclaw-download', publicUrl: 'https://download.example.com/feed/',
      secretIdEnvName: 'unused', secretKeyEnvName: 'unused',
      artifacts: [
        { path: binary, filename: 'setup.exe', key: 'bin/setup.exe', contentType: 'application/octet-stream', channelMetadata: false },
        { path: join(root, 'unused.yml'), filename: 'stable.yml', key: 'feeds/stable.yml', contentType: 'application/yaml',
          channelMetadata: true, contents: 'version: 1.2.3\n' },
      ],
    }
    const f = fixtureClient()
    const transport = desktopPublishOss(plan, { bucket: plan.bucket, region: 'oss-cn-shenzhen' },
      { accessKeyId: 'fixture', accessKeySecret: 'fixture' }, () => f.client)
    expect(await transport.read('bin/setup.exe', false)).toBeNull()
    for (const artifact of plan.artifacts) await transport.put(artifact, await desktopArtifactDigest(artifact), !artifact.channelMetadata)
    expect(f.puts[0]!.options.headers).toMatchObject({ 'x-oss-forbid-overwrite': 'true',
      'Cache-Control': 'public, max-age=31536000, immutable' })
    expect(f.puts[1]!.options.headers).not.toHaveProperty('x-oss-forbid-overwrite')
    expect(f.puts[1]!.options.headers).toMatchObject({ 'Cache-Control': 'no-cache, no-store, must-revalidate' })
    expect(await transport.read('bin/setup.exe', false)).toMatchObject({ size: 13,
      sha512: createHash('sha512').update('signed-binary').digest('base64') })
    expect(await transport.read('feeds/stable.yml', true)).toMatchObject({ contents: 'version: 1.2.3\n' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.runIf(process.platform !== 'win32')('uploads from the verified open handle when its path is replaced', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-oss-handle-'))
  try {
    const binary = join(root, 'setup.exe')
    const replacement = join(root, 'replacement.exe')
    await writeFile(binary, 'verified-binary')
    await writeFile(replacement, 'replacement-bytes')
    const artifact = { path: binary, filename: 'setup.exe', key: 'qingclaw-desktop/bin/setup.exe',
      contentType: 'application/octet-stream', channelMetadata: false }
    const plan: DesktopUploadPlan = { environment: 'production', target: 'win-x64', version: '1.2.3',
      commit: 'a'.repeat(40), dirty: false, bucket: 'qingclaw-download', publicUrl: 'https://download.example.com/feed/',
      secretIdEnvName: 'unused', secretKeyEnvName: 'unused', artifacts: [artifact] }
    const f = fixtureClient(new Map(), async () => { await rename(replacement, binary) })
    const transport = desktopPublishOss(plan, { bucket: plan.bucket, region: 'oss-cn-shenzhen' },
      { accessKeyId: 'fixture', accessKeySecret: 'fixture' }, () => f.client)
    await transport.put(artifact, await desktopArtifactDigest(artifact), true)
    expect(f.objects.get(artifact.key)?.bytes.toString()).toBe('verified-binary')
    expect(await readFile(binary, 'utf8')).toBe('replacement-bytes')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('uploads a verified open installer stream and retains its download filename', async () => {
  const plan: DesktopUploadPlan = { environment: 'production', target: 'mac-arm64', version: '1.2.3',
    bucket: 'qingclaw-download', publicUrl: 'https://download.example.com/desktop/app.dmg',
    secretIdEnvName: 'unused', secretKeyEnvName: 'unused', artifacts: [{ path: '/not-reopened', filename: 'app.dmg',
      key: 'desktop/app.dmg', contentType: 'application/x-apple-diskimage', contentDisposition: 'attachment; filename="app.dmg"',
      channelMetadata: false }] }
  const bytes = Buffer.from('verified-installer')
  const f = fixtureClient()
  const writer = desktopPublishOssWriter(plan, { bucket: plan.bucket, region: 'oss-cn-shenzhen' },
    { accessKeyId: 'fixture', accessKeySecret: 'fixture' }, () => f.client)
  await writer.put({ key: 'desktop/app.dmg', body: Readable.from([bytes]),
    digest: { size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') },
    md5: createHash('md5').update(bytes).digest('base64'), contentType: 'application/x-apple-diskimage',
    contentDisposition: 'attachment; filename="app.dmg"' })
  const transport = desktopPublishOss(plan, { bucket: plan.bucket, region: 'oss-cn-shenzhen' },
    { accessKeyId: 'fixture', accessKeySecret: 'fixture' }, () => f.client)
  expect(await transport.read('desktop/app.dmg', false)).toMatchObject({ size: bytes.length,
    contentDisposition: 'attachment; filename="app.dmg"' })
  expect(f.puts[0]!.options.headers).not.toHaveProperty('x-oss-forbid-overwrite')
  expect(f.puts[0]!.options.headers).toMatchObject({ 'Cache-Control': 'no-cache, no-store, must-revalidate' })
})
