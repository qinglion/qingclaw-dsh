import { beforeEach, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

const h = vi.hoisted(() => ({
  events: [] as string[],
  failLatest: undefined as string | undefined,
  failTag: false,
  mismatchedCommit: false,
  records: [] as Array<{ record: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn> }>,
  tag: vi.fn(),
}))

vi.mock('../scripts/desktop-build-paths.mjs', () => ({
  desktopTargetPlatform: () => ({ platform: 'darwin' }),
}))
vi.mock('../scripts/desktop-package-environment.mjs', () => ({
  loadDesktopPackageEnvironment: () => ({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' }),
}))
vi.mock('../scripts/desktop-upload-plan.ts', () => ({
  createDesktopUploadPlan: vi.fn(async (target: string, options: { latest?: boolean }) => ({
    environment: 'production',
    target,
    version: '2.0.0',
    publicUrl: `https://d.qinglion.com/desktop/${target}`,
    bucket: 'qingclaw-downloads',
    artifacts: [{ key: `${options.latest ? 'desktop/latest' : 'desktop/versioned'}/${target}`, path: '/tmp/artifact' }],
    commit: h.mismatchedCommit && target === 'mac-x64' ? 'b'.repeat(40) : 'a'.repeat(40),
    dirty: false,
  })),
}))
vi.mock('../scripts/desktop-release-tag.ts', () => ({
  tagDesktopRelease: (options: unknown) => {
    h.events.push('tag')
    h.tag(options)
    return h.failTag
      ? { tag: 'desktop-v2.0.0', status: 'failed', detail: 'tag unavailable' }
      : { tag: 'desktop-v2.0.0', status: 'created' }
  },
}))
vi.mock('@deepseek-ai/dsh-desktop-publisher/desktop-auto-update-environment.mjs', () => ({
  requiredEnvironmentValue: (environment: Record<string, string | undefined>, name: string) => {
    const value = environment[name]
    if (value === undefined || value === '') throw new Error(`${name} is required`)
    return value
  },
}))
vi.mock('@deepseek-ai/dsh-desktop-publisher/desktop-publish-oss.ts', () => ({
  desktopPublishOss: () => ({}),
  desktopPublishOssWriter: () => ({}),
}))
vi.mock('@deepseek-ai/dsh-desktop-publisher/desktop-publish.ts', () => ({
  publishDesktopReleaseFiles: vi.fn(async (plan: { target: string }, operations: {
    record: (event: { type: string }) => Promise<void>
  }) => {
    h.events.push(`feed:${plan.target}`)
    await operations.record({ type: 'feeds-complete' })
  }),
  publishDesktopRelease: vi.fn(async (plan: { target: string }, operations: {
    record: (event: { type: string }) => Promise<void>
    tag: () => Promise<void>
  }) => {
    h.events.push(`feed:${plan.target}`)
    await operations.record({ type: 'feeds-complete' })
    await operations.tag()
    await operations.record({ type: 'complete' })
    return { status: 'complete' }
  }),
}))
vi.mock('@deepseek-ai/dsh-desktop-publisher/desktop-publish-record.ts', () => ({
  createDesktopPublicationRecord: vi.fn(async () => {
    const value = { record: vi.fn(async () => undefined), finish: vi.fn(async () => undefined) }
    h.records.push(value)
    return value
  }),
  withDesktopChannelLock: vi.fn(async (_root: string, destination: string, callback: () => Promise<void>) => {
    const target = (JSON.parse(destination) as { target: string }).target
    h.events.push(`lock:${target}`)
    try { await callback() } finally { h.events.push(`unlock:${target}`) }
  }),
}))
vi.mock('@deepseek-ai/dsh-desktop-publisher/desktop-website-installer.ts', () => ({
  prepareWebsiteInstallerPlan: vi.fn(async (plan: unknown) => ({
    plan,
    handle: { close: vi.fn(async () => undefined) },
  })),
  uploadWebsiteInstaller: vi.fn(async (installer: { plan: { target: string } }) => {
    h.events.push(`latest:${installer.plan.target}`)
    if (h.failLatest === installer.plan.target) throw new Error(`latest failed: ${installer.plan.target}`)
    return 'uploaded'
  }),
}))

import { publishBuilderRelease } from '../scripts/publish-builder-target.ts'

const environment = {
  OSS_BUCKET_NAME: 'qingclaw-downloads',
  OSS_REGION: 'oss-cn-hangzhou',
  OSS_ACCESS_KEY_ID: 'test-id',
  OSS_ACCESS_KEY_SECRET: 'test-secret',
}

beforeEach(() => {
  h.events.length = 0
  h.records.length = 0
  h.failLatest = undefined
  h.failTag = false
  h.mismatchedCommit = false
  h.tag.mockClear()
})

it('creates the production tag only after both feeds and fixed installers succeed', async () => {
  await publishBuilderRelease([
    'mac-arm64', 'mac-x64', '--with-latest', '--records-root', resolve('/tmp/qingclaw-records'),
  ], environment)

  expect(h.events).toEqual([
    'lock:mac-arm64', 'lock:mac-x64',
    'feed:mac-arm64', 'latest:mac-arm64',
    'feed:mac-x64', 'latest:mac-x64',
    'tag',
    'unlock:mac-x64', 'unlock:mac-arm64',
  ])
  expect(h.tag).toHaveBeenCalledTimes(1)
  expect(h.records).toHaveLength(2)
  for (const record of h.records) expect(record.finish).toHaveBeenLastCalledWith('complete')
})

it('does not create a production tag when the second fixed installer fails', async () => {
  h.failLatest = 'mac-x64'

  await expect(publishBuilderRelease([
    'mac-arm64', 'mac-x64', '--with-latest', '--records-root', resolve('/tmp/qingclaw-records'),
  ], environment)).rejects.toThrow('latest failed: mac-x64')

  expect(h.events).not.toContain('tag')
  expect(h.tag).not.toHaveBeenCalled()
  for (const record of h.records) expect(record.finish).toHaveBeenLastCalledWith('failed')
})

it('rejects mismatched packaged commits before acquiring locks or writing remotely', async () => {
  h.mismatchedCommit = true

  await expect(publishBuilderRelease([
    'mac-arm64', 'mac-x64', '--with-latest', '--records-root', resolve('/tmp/qingclaw-records'),
  ], environment)).rejects.toThrow('share the packaged commit')

  expect(h.events).toEqual([])
  expect(h.tag).not.toHaveBeenCalled()
})

it('marks both records tag-pending only after every target and alias succeeds', async () => {
  h.failTag = true

  await expect(publishBuilderRelease([
    'mac-arm64', 'mac-x64', '--with-latest', '--records-root', resolve('/tmp/qingclaw-records'),
  ], environment)).rejects.toThrow('tag unavailable')

  expect(h.events.slice(0, -2)).toEqual([
    'lock:mac-arm64', 'lock:mac-x64',
    'feed:mac-arm64', 'latest:mac-arm64',
    'feed:mac-x64', 'latest:mac-x64',
    'tag',
  ])
  for (const record of h.records) {
    expect(record.record).toHaveBeenCalledWith({ type: 'tag-pending' })
    expect(record.finish).toHaveBeenLastCalledWith('published-tag-pending')
  }
})
