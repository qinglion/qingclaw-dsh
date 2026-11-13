import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type OSS from 'ali-oss'
import { afterEach, expect, it, vi } from 'vitest'
import * as desktopCos from '@deepseek-ai/dsh-desktop-publisher/desktop-cos.ts'
import * as desktopOss from '@deepseek-ai/dsh-desktop-publisher/desktop-oss.ts'
import { answer, cosError, startCosLoopback } from './cos-loopback.ts'
import { teo } from 'tencentcloud-sdk-nodejs-teo'
import { readDesktopPublishConfig, type DesktopPublishConfig } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-config.ts'
import { publishWebsiteCi, websiteApproval } from '@deepseek-ai/dsh-desktop-publisher/publish-website-ci.ts'

vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }))
afterEach(() => vi.restoreAllMocks())

it('invalidates website approval when storage region or cache policy changes', () => {
  const base: DesktopPublishConfig = { bucket: 'qinglion', origin: 'https://download.qingclaw.com',
    credentialsFile: '/credentials.json', storage: { provider: 'aliyun-oss', region: 'oss-cn-hangzhou' },
    cache: { provider: 'none' } }
  const approvals = [
    base,
    { ...base, storage: { provider: 'aliyun-oss' as const, region: 'oss-cn-shenzhen' } },
    { ...base, storage: { provider: 'tencent-cos' as const }, cache: { provider: 'none' as const },
      bucket: 'qinglion-123' },
    { ...base, storage: { provider: 'tencent-cos' as const },
      cache: { provider: 'tencent-edgeone' as const, zoneId: 'zone-fixture' }, bucket: 'qinglion-123' },
  ].map(config => websiteApproval({ build: 'fixture' }, config))
  expect(new Set(approvals)).toHaveProperty('size', approvals.length)
})

it.each(['accepted', 'unconfirmed', 'incomplete', 'wrong-journal', 'upload', 'put', 'uploaded', 'metadata', 'metadata-retry', 'stable', 'approval', 'missing-zone'] as const)('preserves publication recovery for %s', async (scenario) => {
  const root = await mkdtemp(join(tmpdir(), 'website-ci-'))
  try {
    const config = join(root, 'packaging')
    const records = join(root, 'upload-records', 'website-99-mac-arm64')
    await mkdir(join(config, 'publishing'), { recursive: true })
    await mkdir(join(root, 'releases', '12', '1'), { recursive: true })
    await mkdir(records, { recursive: true })
    const credentialsFile = join(root, 'credentials.json')
    await writeFile(credentialsFile, JSON.stringify({ secretId: 'fixture-id', secretKey: 'fixture-key' }))
    await writeFile(join(config, 'publishing', 'production.json'), JSON.stringify({
      edgeOneZoneId: scenario === 'missing-zone' ? undefined : 'zone-fixture', bucket: 'production-123', origin: 'https://download.example.com', credentialsFile,
      githubApp: { clientId: 'app', privateKeyFile: join(root, 'app.pem') },
    }))
    const route = { runId: '12', attempt: '1', commit: 'a'.repeat(40), sourceRef: 'master', channel: scenario === 'stable' ? 'stable' : 'nightly',
      runnerName: 'mini', runnerLabel: 'dsh-mini', target: 'mac-arm64', preset: 'production' }
    const manifest = { schemaVersion: 1, source: { repository: 'owner/repo', runId: '12', attempt: '1', commit: route.commit,
      workflowCommit: route.commit, sourceRef: 'master', channel: route.channel, runnerName: 'mini', target: 'mac-arm64',
      preset: 'production', productVersion: '1.0.0', version: '1.0.0', testReleaseId: null, qualification: 'notarized' },
    files: [{ name: 'qingclaw-1.0.0-mac-arm64.dmg', size: 1, sha512: createHash('sha512').update('x').digest('base64') }] }
    await writeFile(join(root, 'releases', '12', '1', 'manifest.json'), JSON.stringify(manifest))
    const approval = websiteApproval(manifest, await readDesktopPublishConfig(config, 'production'))
    await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'uploaded' }))
    if (scenario === 'metadata') await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'uploaded', purgeAttempt: '1', purge: { zoneId: 'zone-fixture', publicUrl: 'https://download.example.com/desktop/qingclaw-latest-macos-arm64.dmg', submittedAt: '2026-10-30T00:00:00.000Z', jobId: 'old-job', status: 'success' } }))
    if (scenario === 'metadata-retry') await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'upload-intent', uploadConfirmed: true }))
    const env = { RUNNER_NAME: 'mini', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '99',
      GITHUB_RUN_ATTEMPT: '1', DSH_PACKAGING_CONFIG_DIR: config, DESKTOP_PUBLISH_ROUTE: JSON.stringify(route),
      DESKTOP_WEBSITE_APPROVAL: approval, DOWNLOAD_PROD_EO_ZONE_ID: 'zone-ignored', GITHUB_OUTPUT: join(root, 'output') }
    if (scenario === 'missing-zone') {
      await rm(credentialsFile)
      for (const mode of ['upload', 'purge'] as const) {
        await expect(publishWebsiteCi(mode, { ...env, DOWNLOAD_PROD_EO_ZONE_ID: 'zone-legacy' }))
          .rejects.toThrow('edgeOneZoneId in publishing/production.json')
      }
      return
    }
    if (scenario === 'upload' || scenario === 'put' || scenario === 'uploaded' || scenario === 'metadata' || scenario === 'metadata-retry' || scenario === 'stable' || scenario === 'approval') {
      await writeFile(join(root, 'releases', '12', '1', manifest.files[0]!.name), 'x')
      if (scenario === 'upload' || scenario === 'put') await rm(join(records, 'state.json'))
      let stored = scenario !== 'put'
      let headerStored = scenario !== 'metadata'
      const server = await startCosLoopback(async (request, response) => {
        if (request.method === 'PUT') {
          expect(request.body.toString()).toBe('x')
          if (scenario === 'metadata') {
            const state: unknown = JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))
            expect(state).toMatchObject({ upload: 'upload-intent', uploadConfirmed: true })
            expect(state).not.toHaveProperty('purge')
            expect(state).not.toHaveProperty('purgeAttempt')
          }
          expect(request.headers['content-disposition']).toBe(`attachment; filename="${manifest.files[0]!.name}"`)
          stored = true
          headerStored = true
          answer(response)
          return
        }
        if (!stored) answer(response, 404, cosError('NoSuchKey'))
        else answer(response, 200, scenario === 'metadata-retry' ? 'y' : 'x', headerStored ? { 'content-disposition': `attachment; filename="${manifest.files[0]!.name}"` } : {})
      })
      const original = desktopCos.createDesktopCos
      vi.spyOn(desktopCos, 'createDesktopCos').mockImplementation((credentials) => {
        const client = original(credentials)
        server.redirect(client)
        return client
      })
      try {
        if (scenario === 'metadata-retry') {
          await expect(publishWebsiteCi('upload', env)).rejects.toThrow('recorded upload no longer matches')
          expect(server.requests.map(request => request.method)).toEqual(['GET'])
        } else if (scenario === 'approval') {
          await expect(publishWebsiteCi('upload', { ...env, DESKTOP_WEBSITE_APPROVAL: 'changed' })).rejects.toThrow('approved build or destination changed')
          expect(server.requests).toHaveLength(0)
        } else {
          const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
          await publishWebsiteCi('upload', env)
          expect(output.mock.calls.map(call => String(call[0])).join('')).toContain((scenario === 'put' || scenario === 'metadata')
            ? 'Website installer uploaded:' : 'identical remote bytes and download filename confirmed; skipped')
          if (scenario === 'upload') expect(server.requests[0]!.path).toBe('/desktop/qingclaw-latest-macos-arm64.dmg')
          expect(server.requests.map(request => request.method)).toEqual((scenario === 'put' || scenario === 'metadata') ? ['GET', 'PUT', 'GET'] : ['GET'])
          expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))).toMatchObject({ approval, upload: 'uploaded' })
          expect(await readFile(env.GITHUB_OUTPUT, 'utf8')).toContain(`record=${records}`)
          if (scenario === 'metadata') {
            const submit = vi.spyOn(teo.v20220901.Client.prototype, 'CreatePurgeTask').mockResolvedValue({ JobId: 'new-job' })
            vi.spyOn(teo.v20220901.Client.prototype, 'DescribePurgeTasks').mockRejectedValue(new Error('unavailable'))
            await publishWebsiteCi('purge', env)
            expect(submit).toHaveBeenCalledOnce()
            expect(submit.mock.calls[0]?.[0]).toMatchObject({ ZoneId: 'zone-fixture' })
            expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))).toMatchObject({ purge: { jobId: 'new-job' } })
          }
        }
      } finally { await server.close() }
      return
    }
    const submit = vi.spyOn(teo.v20220901.Client.prototype, 'CreatePurgeTask').mockResolvedValue({ JobId: 'job-1' })
    if (scenario === 'incomplete' || scenario === 'wrong-journal') {
      await writeFile(join(records, 'state.json'), JSON.stringify({ approval: scenario === 'wrong-journal' ? 'other' : approval, upload: 'upload-intent' }))
      const query = vi.spyOn(teo.v20220901.Client.prototype, 'DescribePurgeTasks')
      await expect(publishWebsiteCi('purge', env)).rejects.toThrow(scenario === 'incomplete' ? 'upload completion is not confirmed' : 'journal belongs to another approved build')
      expect(submit).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
      return
    }
    const query = vi.spyOn(teo.v20220901.Client.prototype, 'DescribePurgeTasks').mockRejectedValue(new Error('fixture-key'))
    if (scenario === 'unconfirmed') submit.mockRejectedValue(new Error('lost response'))
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-30T00:00:00.000Z'))
    const summary = join(root, 'summary.md')
    await publishWebsiteCi('purge', { RUNNER_NAME: 'mini', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '99',
      GITHUB_RUN_ATTEMPT: '1', DSH_PACKAGING_CONFIG_DIR: config, DESKTOP_PUBLISH_ROUTE: JSON.stringify(route),
      DESKTOP_WEBSITE_APPROVAL: approval, GITHUB_STEP_SUMMARY: summary })
    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ ZoneId: 'zone-fixture' })
    expect(query).toHaveBeenCalledTimes(2)
    expect(output.mock.calls.map(call => String(call[0])).join('')).toContain('::warning title=官网缓存刷新结果未确认::')
    expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))).toMatchObject({ upload: 'uploaded', purge: { status: 'unknown' } })
    await expect(await readFile(summary, 'utf8')).toMatchFileSnapshot(`./expected/website-purge-${scenario}.md`)
    expect(await readFile(summary, 'utf8')).not.toContain('fixture-key')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('publishes a fixed website installer through the selected Alibaba OSS provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'website-ci-oss-'))
  try {
    const config = join(root, 'packaging')
    const records = join(root, 'upload-records', 'website-99-mac-arm64')
    const release = join(root, 'releases', '12', '1')
    const credentialsFile = join(root, 'oss.json')
    await mkdir(join(config, 'publishing'), { recursive: true })
    await mkdir(release, { recursive: true })
    await writeFile(credentialsFile, JSON.stringify({ accessKeyId: 'fixture-id', accessKeySecret: 'fixture-secret' }))
    await writeFile(join(config, 'publishing', 'production.json'), JSON.stringify({
      bucket: 'qinglion', origin: 'https://download.qingclaw.com', credentialsFile,
      storage: { provider: 'aliyun-oss', region: 'oss-cn-hangzhou' }, cache: { provider: 'none' },
      githubApp: { clientId: 'app', privateKeyFile: join(root, 'app.pem') },
    }))
    const route = { runId: '12', attempt: '1', commit: 'a'.repeat(40), sourceRef: 'master', channel: 'nightly' as const,
      runnerName: 'mini', runnerLabel: 'dsh-mini', target: 'mac-arm64' as const, preset: 'production' as const }
    const filename = 'qingclaw-1.0.0-mac-arm64.dmg'
    const bytes = Buffer.from('x')
    const manifest = { schemaVersion: 1 as const, source: { repository: 'owner/repo', runId: route.runId,
      attempt: route.attempt, commit: route.commit, workflowCommit: route.commit, sourceRef: route.sourceRef,
      channel: route.channel, runnerName: route.runnerName, target: route.target, preset: route.preset,
      productVersion: '1.0.0', version: '1.0.0', testReleaseId: null, qualification: 'notarized' as const },
    files: [{ name: filename, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }] }
    await writeFile(join(release, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(release, filename), bytes)
    const selected = await readDesktopPublishConfig(config, 'production')
    const approval = websiteApproval(manifest, selected)
    const requests: string[] = []
    let stored: Buffer | undefined
    let putOptions: OSS.PutStreamOptions | undefined
    const client = {
      async getStream(name = '') {
        requests.push(`GET ${name}`)
        if (stored === undefined) throw Object.assign(new Error('missing'), { code: 'NoSuchKey', status: 404 })
        return { stream: Readable.from([stored]), res: { status: 200,
          headers: { 'content-disposition': `attachment; filename="${filename}"` }, size: stored.length, rt: 1 } }
      },
      async putStream(name: string, source: unknown, options?: OSS.PutStreamOptions) {
        requests.push(`PUT ${name}`)
        const chunks: Buffer[] = []
        for await (const chunk of source as AsyncIterable<Buffer | Uint8Array | string>) chunks.push(Buffer.from(chunk))
        stored = Buffer.concat(chunks)
        putOptions = options
        return { name, res: { status: 200, headers: {}, size: 0, rt: 1 } }
      },
    }
    const create = vi.spyOn(desktopOss, 'createDesktopOss').mockImplementation((destination, credentials) => {
      expect(destination).toEqual({ bucket: 'qinglion', region: 'oss-cn-hangzhou' })
      expect(credentials).toEqual({ accessKeyId: 'fixture-id', accessKeySecret: 'fixture-secret' })
      return client as unknown as OSS
    })
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await publishWebsiteCi('upload', { RUNNER_NAME: route.runnerName, GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '99', GITHUB_RUN_ATTEMPT: '1', DSH_PACKAGING_CONFIG_DIR: config,
      DESKTOP_PUBLISH_ROUTE: JSON.stringify(route), DESKTOP_WEBSITE_APPROVAL: approval,
      GITHUB_OUTPUT: join(root, 'output') })
    const key = 'desktop/qingclaw-latest-macos-arm64.dmg'
    expect(requests).toEqual([`GET ${key}`, `PUT ${key}`, `GET ${key}`])
    expect(stored).toEqual(bytes)
    expect(putOptions).toMatchObject({ contentLength: bytes.length, mime: 'application/x-apple-diskimage',
      headers: { 'Content-MD5': createHash('md5').update(bytes).digest('base64'),
        'Content-Disposition': `attachment; filename="${filename}"` } })
    expect(putOptions?.headers).not.toHaveProperty('x-oss-forbid-overwrite')
    expect(create).toHaveBeenCalledTimes(3)
    expect(output.mock.calls.map(call => String(call[0])).join('')).toContain('Website installer uploaded:')
    expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8')))
      .toMatchObject({ approval, upload: 'uploaded', uploadConfirmed: true })
    expect(await readFile(join(root, 'upload-records', 'website-99-mac-arm64', 'state.json'), 'utf8'))
      .not.toContain('fixture-secret')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('treats cache provider none as a credential-free successful purge no-op', async () => {
  const root = await mkdtemp(join(tmpdir(), 'website-ci-none-'))
  try {
    const config = join(root, 'packaging')
    const records = join(root, 'upload-records', 'website-99-mac-arm64')
    await mkdir(join(config, 'publishing'), { recursive: true })
    await mkdir(join(root, 'releases', '12', '1'), { recursive: true })
    await mkdir(records, { recursive: true })
    const route = { runId: '12', attempt: '1', commit: 'a'.repeat(40), sourceRef: 'master', channel: 'nightly' as const,
      runnerName: 'mini', runnerLabel: 'dsh-mini', target: 'mac-arm64' as const, preset: 'production' as const }
    const manifest = { schemaVersion: 1 as const, source: { repository: 'owner/repo', runId: '12', attempt: '1', commit: route.commit,
      workflowCommit: route.commit, sourceRef: 'master', channel: route.channel, runnerName: 'mini', target: route.target,
      preset: route.preset, productVersion: '1.0.0', version: '1.0.0', testReleaseId: null, qualification: 'notarized' as const },
    files: [{ name: 'qingclaw-1.0.0-mac-arm64.dmg', size: 1, sha512: createHash('sha512').update('x').digest('base64') }] }
    await writeFile(join(root, 'releases', '12', '1', 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(config, 'publishing', 'production.json'), JSON.stringify({
      bucket: 'qinglion', origin: 'https://download.qingclaw.com', credentialsFile: join(root, 'missing-oss-credentials.json'),
      storage: { provider: 'aliyun-oss', region: 'oss-cn-hangzhou' }, cache: { provider: 'none' },
      githubApp: { clientId: 'app', privateKeyFile: join(root, 'missing-app.pem') },
    }))
    const approval = websiteApproval(manifest, await readDesktopPublishConfig(config, 'production'))
    await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'uploaded' }))
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await publishWebsiteCi('purge', { RUNNER_NAME: 'mini', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '99',
      GITHUB_RUN_ATTEMPT: '1', DSH_PACKAGING_CONFIG_DIR: config, DESKTOP_PUBLISH_ROUTE: JSON.stringify(route),
      DESKTOP_WEBSITE_APPROVAL: approval })
    expect(output.mock.calls.map(call => String(call[0])).join('')).toContain('cache purge not required')
  } finally { await rm(root, { recursive: true, force: true }) }
})
