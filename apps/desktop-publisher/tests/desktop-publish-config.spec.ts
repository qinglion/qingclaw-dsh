import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  desktopPublishDestination,
  desktopPublishPolicy,
  readDesktopPublishConfig,
  readDesktopUploadCredentials,
  requireDesktopEdgeOneZoneId,
  requireDesktopWebsiteCache,
  type DesktopPublishConfig,
} from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-config.ts'

it('binds approval and publication records to storage, region, origin and cache policy', () => {
  const base: DesktopPublishConfig = { bucket: 'production-123', origin: 'https://download.example.com',
    credentialsFile: '/credentials.json', storage: { provider: 'tencent-cos' }, cache: { provider: 'none' } }
  const oss: DesktopPublishConfig = { ...base, storage: { provider: 'aliyun-oss', region: 'oss-cn-hangzhou' } }
  const shifted: DesktopPublishConfig = { ...oss, storage: { provider: 'aliyun-oss', region: 'oss-cn-shenzhen' } }
  const cached: DesktopPublishConfig = { ...base,
    cache: { provider: 'tencent-edgeone', zoneId: 'zone-fixture' } }
  expect(new Set([base, oss, shifted, cached].map(config =>
    JSON.stringify(desktopPublishPolicy(config))))).toHaveProperty('size', 4)
  expect(new Set([base, oss, shifted].map(config =>
    desktopPublishDestination(config, 'feeds/nightly.yml')))).toHaveProperty('size', 3)
  expect(desktopPublishDestination(base, 'feeds/nightly.yml'))
    .not.toBe(desktopPublishDestination(base, 'feeds/stable.yml'))
})

it('reads public settings without opening the absent credential file and requires production App settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    await mkdir(join(root, 'publishing'))
    const config = { bucket: 'test-1250000000', origin: 'https://example.com', credentialsFile: join(root, 'absent.json') }
    await writeFile(join(root, 'publishing/test.json'), JSON.stringify(config))
    const selected = await readDesktopPublishConfig(root, 'test')
    expect(selected).toEqual(config)
    await expect(readDesktopUploadCredentials(selected)).rejects.toThrow(/cannot read valid upload credentials/u)
    await writeFile(join(root, 'publishing/production.json'), JSON.stringify({ ...config, origin: 'https://download.example.com' }))
    await expect(readDesktopPublishConfig(root, 'production')).rejects.toThrow(/GitHub App configuration/u)
    await writeFile(config.credentialsFile, JSON.stringify({ secretId: 'fixture', secretKey: 'fixture-only' }))
    await expect(readDesktopUploadCredentials(selected)).resolves.toEqual({ secretId: 'fixture', secretKey: 'fixture-only' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('does not include malformed credential contents in errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    const credentialsFile = join(root, 'credentials.json')
    await writeFile(credentialsFile, '{secret-value-should-not-appear')
    await expect(readDesktopUploadCredentials({ credentialsFile, bucket: 'test-1', origin: 'https://example.com' }))
      .rejects.not.toThrow(/secret-value/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects multiline App outputs before writing Actions output fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    await mkdir(join(root, 'publishing'))
    const config = { bucket: 'test-1', origin: 'https://download.example.com', credentialsFile: join(root, 'absent.json'),
      githubApp: { clientId: 'app-id', privateKeyFile: join(root, 'key.pem') } }
    for (const githubApp of [
      { ...config.githubApp, clientId: 'app-id\nother=value' },
      { ...config.githubApp, privateKeyFile: join(root, 'key\nother=value') },
    ]) {
      await writeFile(join(root, 'publishing/production.json'), JSON.stringify({ ...config, githubApp }))
      await expect(readDesktopPublishConfig(root, 'production')).rejects.toThrow(/single-line/u)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('validates optional EdgeOne settings and requires them only for website operations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-zone-'))
  try {
    await mkdir(join(root, 'publishing'))
    const config = { bucket: 'test-123', origin: 'https://example.com', credentialsFile: join(root, 'absent.json') }
    const file = join(root, 'publishing/test.json')
    await writeFile(file, JSON.stringify(config))
    const selected = await readDesktopPublishConfig(root, 'test')
    expect(() => requireDesktopEdgeOneZoneId(selected)).toThrow('edgeOneZoneId in publishing/production.json')
    await writeFile(file, JSON.stringify({ ...config, edgeOneZoneId: 'zone-fixture' }))
    expect(requireDesktopEdgeOneZoneId(await readDesktopPublishConfig(root, 'test'))).toBe('zone-fixture')
    for (const edgeOneZoneId of ['', 'invalid', 'zone-example\n', 123]) {
      await writeFile(file, JSON.stringify({ ...config, edgeOneZoneId }))
      await expect(readDesktopPublishConfig(root, 'test')).rejects.toHaveProperty('issues.0.path', ['edgeOneZoneId'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('selects native Alibaba OSS credentials and explicit cache-free website publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-oss-'))
  try {
    await mkdir(join(root, 'publishing'))
    const credentialsFile = join(root, 'oss.json')
    await writeFile(credentialsFile, JSON.stringify({ accessKeyId: 'fixture-id', accessKeySecret: 'fixture-secret' }))
    const config = { bucket: 'qingclaw-desktop-download', origin: 'https://download.example.com', credentialsFile,
      storage: { provider: 'aliyun-oss', region: 'oss-cn-shenzhen' }, cache: { provider: 'none' } }
    await writeFile(join(root, 'publishing/test.json'), JSON.stringify(config))
    const selected = await readDesktopPublishConfig(root, 'test')
    expect(selected).toEqual(config)
    await expect(readDesktopUploadCredentials(selected)).resolves.toEqual({ accessKeyId: 'fixture-id', accessKeySecret: 'fixture-secret' })
    expect(requireDesktopWebsiteCache(selected)).toEqual({ provider: 'none' })
    expect(() => requireDesktopEdgeOneZoneId(selected)).toThrow('edgeOneZoneId')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects Alibaba OSS with Tencent cache or COS-shaped credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-oss-'))
  try {
    await mkdir(join(root, 'publishing'))
    const credentialsFile = join(root, 'oss.json')
    const config = { bucket: 'qingclaw-desktop-download', origin: 'https://download.example.com', credentialsFile,
      storage: { provider: 'aliyun-oss', region: 'oss-cn-shenzhen' } }
    await writeFile(join(root, 'publishing/test.json'), JSON.stringify({ ...config,
      cache: { provider: 'tencent-edgeone', zoneId: 'zone-fixture' } }))
    await expect(readDesktopPublishConfig(root, 'test')).rejects.toHaveProperty('issues.0.path', ['cache'])
    await writeFile(join(root, 'publishing/test.json'), JSON.stringify({ ...config, cache: { provider: 'none' } }))
    await writeFile(credentialsFile, JSON.stringify({ secretId: 'wrong', secretKey: 'wrong' }))
    const selected = await readDesktopPublishConfig(root, 'test')
    await expect(readDesktopUploadCredentials(selected)).rejects.toThrow('cannot read valid upload credentials')
  } finally { await rm(root, { recursive: true, force: true }) }
})
