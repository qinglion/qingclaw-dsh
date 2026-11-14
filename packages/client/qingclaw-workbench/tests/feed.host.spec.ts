import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import QingClawWorkbench, { type Config } from '../src/index.ts'
import {
  fetchOfficialFeed, parseCacheRecord, parseOfficialFeed, serializeCacheRecord,
  WORKBENCH_COURSE_LIMIT, WORKBENCH_VIDEO_LIMIT,
} from '../src/feed.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function officialFeed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    revision: 'revision-1',
    updated_at: '2026-11-14T08:00:00Z',
    latest_videos: [{
      id: 7,
      title: '律师 AI 实战',
      cover_url: 'https://qingclaw.com/covers/video.jpg',
      duration: '12:34',
      published_at: '2026-11-14T08:00:00Z',
      course_title: '律师 AI 课',
      watch_url: 'https://qingclaw.com/courses/lawyer-ai?video_id=7',
    }],
    featured_courses: [{
      id: 'lawyer-ai',
      title: '律师 AI 课',
      cover_url: 'https://qingclaw.com/covers/course.jpg',
      lesson_count: 8,
      course_url: 'https://qingclaw.com/courses/lawyer-ai',
    }],
    links: { all_courses: 'https://qingclaw.com/courses' },
    ...overrides,
  }
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function tempCache(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'qingclaw-workbench-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'feed.json')
}

async function service(cacheFile: string | undefined, overrides: Partial<Config> = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
  const config: Config = {
    feedUrl: 'https://qingclaw.com/api/workbench-feed',
    cacheTtlMs: 300_000,
    fetchTimeoutMs: 1_000,
    maxResponseBytes: 64 * 1024,
    ...cacheFile === undefined ? {} : { cacheFile },
    ...overrides,
  }
  await ctx.plugin(QingClawWorkbench, config)
  return ctx.qingclawWorkbench
}

it('normalizes Feed v1, rejects unsafe URLs, and enforces the producer list bounds', () => {
  const videos = Array.from({ length: WORKBENCH_VIDEO_LIMIT + 4 }, (_, id) => ({
    id,
    title: `Video ${String(id)}`,
    watch_url: `https://qingclaw.com/videos/${String(id)}`,
  }))
  videos.splice(1, 0, { id: 999, title: 'Unsafe', watch_url: 'javascript:alert(1)' })
  const courses = Array.from({ length: WORKBENCH_COURSE_LIMIT + 3 }, (_, id) => ({
    id,
    title: `Course ${String(id)}`,
    course_url: `https://qingclaw.com/courses/${String(id)}`,
    lesson_count: id - 1,
  }))
  const parsed = parseOfficialFeed(officialFeed({
    latest_videos: videos,
    featured_courses: courses,
    links: { all_courses: 'file:///tmp/not-public' },
  }))
  expect(parsed.latestVideos).toHaveLength(WORKBENCH_VIDEO_LIMIT - 1)
  expect(parsed.latestVideos.some(item => item.title === 'Unsafe')).toBe(false)
  expect(parsed.featuredCourses).toHaveLength(WORKBENCH_COURSE_LIMIT)
  expect(parsed.featuredCourses[0]?.lessonCount).toBe(0)
  expect(parsed.links.allCourses).toBe('https://qingclaw.com/courses')
})

it('round-trips a normalized last-good record through the versioned disk format', () => {
  const feed = parseOfficialFeed(officialFeed())
  const stored = serializeCacheRecord({ version: 1, fetchedAt: Date.parse('2026-11-14T09:00:00Z'), feed })
  expect(parseCacheRecord(JSON.parse(stored))).toEqual({
    version: 1,
    fetchedAt: Date.parse('2026-11-14T09:00:00Z'),
    feed,
  })
})

it('stops reading an oversized response before parsing it', async () => {
  await expect(fetchOfficialFeed({
    url: new URL('https://qingclaw.com/api/workbench-feed'),
    timeoutMs: 1_000,
    maxResponseBytes: 16,
    signal: new AbortController().signal,
    fetchImpl: vi.fn().mockResolvedValue(response(officialFeed())),
  })).rejects.toThrow('exceeds the byte limit')
})

it('shares one network refresh, then serves the fresh owner-private cache', async () => {
  const cacheFile = await tempCache()
  const pending = Promise.withResolvers<Response>()
  const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending.promise)
  vi.stubGlobal('fetch', fetchMock)
  const subject = await service(cacheFile)
  const left = subject.getFeed(false)
  const right = subject.getFeed(false)
  pending.resolve(response(officialFeed()))
  expect(await left).toMatchObject({ source: 'network', stale: false })
  expect(await right).toMatchObject({ source: 'network', stale: false })
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(await subject.getFeed(false)).toMatchObject({ source: 'cache', stale: false })
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(JSON.parse(await readFile(cacheFile, 'utf8'))).toMatchObject({ version: 1 })
  expect((await stat(cacheFile)).mode & 0o777).toBe(0o600)
})

it('returns a persisted last-good value as stale when a forced refresh fails', async () => {
  const cacheFile = await tempCache()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response(officialFeed())))
  const writer = await service(cacheFile)
  await writer.getFeed(false)

  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))
  const reader = await service(cacheFile)
  const result = await reader.getFeed(true)
  expect(result).toMatchObject({ source: 'last-good', stale: true })
  expect(result.feed.latestVideos[0]?.title).toBe('律师 AI 实战')
})

it('surfaces a typed retryable failure when neither network nor cache is available', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))
  const subject = await service(undefined)
  await expect(subject.getFeed(false)).rejects.toMatchObject({
    code: 'qingclaw-workbench/feed-unavailable',
    details: { reason: 'network' },
  })
})
