/** Validation, bounded download, and durable-cache encoding for the QingClaw Feed v1 boundary. */

import type { WorkbenchCourse, WorkbenchFeed, WorkbenchVideo } from './types.ts'

/** Hard protocol limits inherited from the public Feed v1 producer. */
export const WORKBENCH_VIDEO_LIMIT = 30
export const WORKBENCH_COURSE_LIMIT = 4
export const DEFAULT_ALL_COURSES_URL = 'https://qingclaw.com/courses'

interface FeedFetchOptions {
  readonly url: URL
  readonly timeoutMs: number
  readonly maxResponseBytes: number
  readonly signal: AbortSignal
  readonly fetchImpl?: typeof fetch
}

/** Versioned disk record. The payload stays in public Feed v1 shape so one parser owns both boundaries. */
export interface WorkbenchCacheRecord {
  readonly version: 1
  readonly fetchedAt: number
  readonly feed: WorkbenchFeed
}

/** A malformed or unsupported public response. */
export class WorkbenchFeedFormatError extends Error {
  override name = 'WorkbenchFeedFormatError'
}

/** Download and validate the public Feed v1 response without reading unbounded response bytes. */
export async function fetchOfficialFeed(options: FeedFetchOptions): Promise<WorkbenchFeed> {
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const signal = AbortSignal.any([options.signal, timeout])
  const response = await (options.fetchImpl ?? fetch)(options.url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'QingClaw-Workbench/2.0',
    },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) throw new Error(`QingClaw Feed returned HTTP ${String(response.status)}`)
  const bytes = await readBoundedBody(response, options.maxResponseBytes)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    throw new WorkbenchFeedFormatError('QingClaw Feed is not valid UTF-8', { cause })
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    throw new WorkbenchFeedFormatError('QingClaw Feed is not valid JSON', { cause })
  }
  return parseOfficialFeed(value)
}

/** Normalize only valid Feed v1 items; malformed individual cards never poison valid siblings. */
export function parseOfficialFeed(value: unknown): WorkbenchFeed {
  const root = record(value, 'QingClaw Feed must be an object')
  if (root.schema_version !== 1) throw new WorkbenchFeedFormatError('Unsupported QingClaw Feed schema version')
  if (!Array.isArray(root.latest_videos) || !Array.isArray(root.featured_courses)) {
    throw new WorkbenchFeedFormatError('QingClaw Feed lists are missing')
  }
  const latestVideos = root.latest_videos.slice(0, WORKBENCH_VIDEO_LIMIT)
    .map(parseVideo).filter((item): item is WorkbenchVideo => item !== undefined)
  const featuredCourses = root.featured_courses.slice(0, WORKBENCH_COURSE_LIMIT)
    .map(parseCourse).filter((item): item is WorkbenchCourse => item !== undefined)
  const links = isRecord(root.links) ? root.links : {}
  const updatedAt = text(root.updated_at)
  return {
    schemaVersion: 1,
    revision: text(root.revision) ?? '',
    ...updatedAt === undefined ? {} : { updatedAt },
    latestVideos,
    featuredCourses,
    links: { allCourses: httpUrl(links.all_courses) ?? DEFAULT_ALL_COURSES_URL },
  }
}

/** Decode a cache record and revalidate its embedded public payload. */
export function parseCacheRecord(value: unknown): WorkbenchCacheRecord {
  const root = record(value, 'QingClaw Workbench cache must be an object')
  if (root.version !== 1) throw new WorkbenchFeedFormatError('Unsupported QingClaw Workbench cache version')
  const fetchedAt = Date.parse(typeof root.fetched_at === 'string' ? root.fetched_at : '')
  if (!Number.isFinite(fetchedAt)) throw new WorkbenchFeedFormatError('QingClaw Workbench cache timestamp is invalid')
  return { version: 1, fetchedAt, feed: parseOfficialFeed(root.payload) }
}

/** Serialize a normalized cache record back into the public Feed v1 vocabulary. */
export function serializeCacheRecord(record: WorkbenchCacheRecord): string {
  const feed = record.feed
  return `${JSON.stringify({
    version: 1,
    fetched_at: new Date(record.fetchedAt).toISOString(),
    payload: {
      schema_version: 1,
      revision: feed.revision,
      updated_at: feed.updatedAt ?? '',
      latest_videos: feed.latestVideos.map(video => ({
        id: video.id,
        title: video.title,
        cover_url: video.coverUrl ?? '',
        duration: video.duration ?? '',
        published_at: video.publishedAt ?? '',
        course_title: video.courseTitle ?? '',
        watch_url: video.watchUrl,
      })),
      featured_courses: feed.featuredCourses.map(course => ({
        id: course.id,
        title: course.title,
        cover_url: course.coverUrl ?? '',
        lesson_count: course.lessonCount,
        course_url: course.courseUrl,
      })),
      links: { all_courses: feed.links.allCourses },
    },
  })}\n`
}

function parseVideo(value: unknown): WorkbenchVideo | undefined {
  if (!isRecord(value)) return
  const title = text(value.title)
  const watchUrl = httpUrl(value.watch_url)
  if (title === undefined || watchUrl === undefined) return
  const coverUrl = httpUrl(value.cover_url)
  const duration = text(value.duration)
  const publishedAt = text(value.published_at)
  const courseTitle = text(value.course_title)
  return {
    id: identifier(value.id) ?? watchUrl,
    title,
    ...coverUrl === undefined ? {} : { coverUrl },
    ...duration === undefined ? {} : { duration },
    ...publishedAt === undefined ? {} : { publishedAt },
    ...courseTitle === undefined ? {} : { courseTitle },
    watchUrl,
  }
}

function parseCourse(value: unknown): WorkbenchCourse | undefined {
  if (!isRecord(value)) return
  const title = text(value.title)
  const courseUrl = httpUrl(value.course_url)
  if (title === undefined || courseUrl === undefined) return
  const coverUrl = httpUrl(value.cover_url)
  const lessonCount = typeof value.lesson_count === 'number' && Number.isFinite(value.lesson_count)
    ? Math.max(0, Math.trunc(value.lesson_count)) : 0
  return {
    id: identifier(value.id) ?? courseUrl,
    title,
    ...coverUrl === undefined ? {} : { coverUrl },
    lessonCount,
    courseUrl,
  }
}

async function readBoundedBody(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw new Error('QingClaw Feed response exceeds the byte limit')
  const reader = response.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new Error('QingClaw Feed response exceeds the byte limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new WorkbenchFeedFormatError(message)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

function identifier(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return text(value)
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hostname === '') return
    if (url.username !== '' || url.password !== '') return
    return url.href
  } catch {
    return
  }
}
