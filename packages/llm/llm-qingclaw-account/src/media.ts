/** QingClaw video-generation bodies: media slots, argument validation, and data-URL encoding. @module */
import { Buffer } from 'node:buffer'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Gateway route that accepts one asynchronous video-synthesis task. */
export const VIDEO_SYNTHESIS_PATH = '/video/api/v1/services/aigc/video-generation/video-synthesis'

/** Resolution tier the gateway bills per delivered second. */
export type VideoResolution = '480P' | '720P' | '1080P'

/** Frame ratio of the rendered clip; `adaptive` follows the media it is given. */
export type VideoRatio = 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'

/** Every ratio the gateway accepts. */
export const VIDEO_RATIOS: readonly VideoRatio[] = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']

/** Shortest rendered clip. */
export const MIN_VIDEO_SECONDS = 2

/** Longest rendered clip in one task. */
export const MAX_VIDEO_SECONDS = 30

/** Duration argument that lets the model choose the length. */
export const SMART_DURATION = -1

/** Clip length used when the caller supplies no `seconds`. */
export const DEFAULT_VIDEO_SECONDS = 5

/** Reference images one call may send. */
export const MAX_REFERENCE_IMAGES = 10

/** Reference videos one call may send. */
export const MAX_REFERENCE_VIDEOS = 5

/** Reference audio tracks one call may send. */
export const MAX_REFERENCE_AUDIOS = 5

/** Largest image one media slot accepts. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const DEFAULT_RESOLUTION: VideoResolution = '480P'

const IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** Media slot names the gateway routes on. */
export type MediaType =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'

/** One `input.media` entry. */
export interface MediaItem {
  readonly type: MediaType
  readonly url: string
}

/** File kinds a media slot carries. */
export type MediaKind = 'image' | 'video' | 'audio'

/** Rejection of a media argument the gateway cannot accept. */
export class MediaArgumentError extends HarnessError {
  /**
   * @param message - model-facing explanation naming the rejected argument.
   */
  constructor(message: string) {
    super(message, 'MEDIA_ARGUMENT_INVALID')
    this.name = 'MediaArgumentError'
  }
}

/** One validated call before its local files are encoded. */
export interface VideoArgs {
  readonly prompt: string
  /** Rendered seconds, or {@link SMART_DURATION} for the model-chosen length. */
  readonly seconds: number
  readonly resolution: VideoResolution
  readonly ratio?: VideoRatio
  /** Whether the rendered clip carries an audio track. */
  readonly sound?: boolean
  readonly firstFrame?: string
  readonly lastFrame?: string
  readonly referenceImages: readonly string[]
  readonly referenceVideos: readonly string[]
  readonly referenceAudios: readonly string[]
}

function optionalString(args: object, key: string): string | undefined {
  const value: unknown = Reflect.get(args, key)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new MediaArgumentError(`${key} must be a string`)
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function optionalFlag(args: object, key: string): boolean | undefined {
  const value: unknown = Reflect.get(args, key)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new MediaArgumentError(`${key} must be true or false`)
  return value
}

function stringList(args: object, key: string, max: number): readonly string[] {
  const value: unknown = Reflect.get(args, key)
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new MediaArgumentError(`${key} must be an array of references`)
  if (value.length > max) throw new MediaArgumentError(`${key} accepts at most ${max} references`)
  return value.map((entry: unknown, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new MediaArgumentError(`${key}[${index}] must be a non-empty reference`)
    }
    return entry.trim()
  })
}

function readSeconds(args: object): number {
  const value: unknown = Reflect.get(args, 'seconds')
  if (value === undefined || value === null || value === '') return DEFAULT_VIDEO_SECONDS
  if (value === 'auto') return SMART_DURATION
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (numeric === SMART_DURATION) return SMART_DURATION
  if (!Number.isInteger(numeric) || numeric < MIN_VIDEO_SECONDS || numeric > MAX_VIDEO_SECONDS) {
    throw new MediaArgumentError(
      `seconds must be a whole number from ${MIN_VIDEO_SECONDS} to ${MAX_VIDEO_SECONDS}, or "auto"`,
    )
  }
  return numeric
}

/**
 * Map an output size onto the resolution tier the gateway prices.
 * @param size - pixel size such as `1280x720`, or a tier such as `720p`.
 * @returns the tier named by the size, or 480P when no size is given.
 * @throws {MediaArgumentError} when the size names no supported tier.
 */
export function resolutionOf(size: string | undefined): VideoResolution {
  if (size === undefined) return DEFAULT_RESOLUTION
  const match = /(1080|720|480)/u.exec(size)
  if (match === null) {
    throw new MediaArgumentError('size must name a 480, 720, or 1080 pixel tier, for example 1280x720')
  }
  return `${match[1]}P` as VideoResolution
}

/**
 * Read the frame-ratio argument.
 * @param ratio - declared ratio, or `auto` for the gateway's adaptive choice.
 * @returns the ratio to send, or undefined when the caller left it to the gateway.
 * @throws {MediaArgumentError} when the value is not one of {@link VIDEO_RATIOS}.
 */
export function ratioOf(ratio: string | undefined): VideoRatio | undefined {
  if (ratio === undefined) return undefined
  const normalized = ratio === 'auto' ? 'adaptive' : ratio
  const match = VIDEO_RATIOS.find(candidate => candidate === normalized)
  if (match === undefined) {
    throw new MediaArgumentError(`ratio must be one of ${VIDEO_RATIOS.join(', ')}`)
  }
  return match
}

/**
 * Read and validate one video-generation call.
 * @param args - lossless model arguments.
 * @returns the prompt, duration, resolution, and media references before encoding.
 * @throws {MediaArgumentError} when a required argument is missing, out of range, or mixes task modes.
 */
export function readVideoArgs(args: unknown): VideoArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new MediaArgumentError('video arguments must be an object')
  }
  const prompt = optionalString(args, 'prompt')
  if (prompt === undefined) throw new MediaArgumentError('prompt is required')
  const firstFrame = optionalString(args, 'firstFrame')
  const lastFrame = optionalString(args, 'lastFrame')
  const referenceImages = stringList(args, 'images', MAX_REFERENCE_IMAGES)
  const referenceVideos = stringList(args, 'videos', MAX_REFERENCE_VIDEOS)
  const referenceAudios = stringList(args, 'audios', MAX_REFERENCE_AUDIOS)
  const frameMode = firstFrame !== undefined || lastFrame !== undefined
  const referenceMode = referenceImages.length > 0 || referenceVideos.length > 0 || referenceAudios.length > 0
  if (frameMode && referenceMode) {
    throw new MediaArgumentError(
      'firstFrame/lastFrame cannot be combined with images/videos/audios: one call is either a frame animation or a reference composition',
    )
  }
  const ratio = ratioOf(optionalString(args, 'ratio'))
  const sound = optionalFlag(args, 'sound')
  return {
    prompt,
    seconds: readSeconds(args),
    resolution: resolutionOf(optionalString(args, 'size')),
    ...(ratio === undefined ? {} : { ratio }),
    ...(sound === undefined ? {} : { sound }),
    ...(firstFrame === undefined ? {} : { firstFrame }),
    ...(lastFrame === undefined ? {} : { lastFrame }),
    referenceImages,
    referenceVideos,
    referenceAudios,
  }
}

/**
 * File kind a media slot carries.
 * @param type - gateway media slot.
 * @returns the kind whose format and size limits apply.
 */
export function mediaKindOf(type: MediaType): MediaKind {
  switch (type) {
    case 'reference_video': return 'video'
    case 'reference_audio': return 'audio'
    case 'first_frame':
    case 'last_frame':
    case 'reference_image':
      return 'image'
    default: return assertNever(type)
  }
}

function assertNever(value: never): never {
  throw new MediaArgumentError('unsupported media type ' + String(value))
}

/**
 * Resolve the media type the gateway parses for one local image path.
 * @param path - local path whose extension names the format.
 * @returns the media type, or undefined when the extension is unsupported.
 */
export function imageMediaTypeOf(path: string): string | undefined {
  const extension = /\.([A-Za-z0-9]+)$/u.exec(path)?.[1]?.toLowerCase()
  return extension === undefined ? undefined : IMAGE_MEDIA_TYPES[extension]
}

/**
 * Whether the gateway can fetch one reference itself.
 * @param value - a URL, a data URL, or a local path.
 * @returns true for http(s), oss, and data references.
 */
export function isHostedReference(value: string): boolean {
  return /^(?:https?:\/\/|oss:\/\/|data:)/iu.test(value)
}

/**
 * Encode image bytes as the data URL the gateway accepts in a media `url`.
 * @param bytes - complete file content.
 * @param mediaType - media type matching those bytes.
 * @returns `data:<mediaType>;base64,<payload>`.
 */
export function dataUrlOf(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * Build the asynchronous video-synthesis request body.
 * @param args - validated arguments.
 * @param media - fully resolved media slots, in prompt-reference order.
 * @param model - gateway model id.
 * @returns the JSON body for {@link VIDEO_SYNTHESIS_PATH}.
 */
export function videoSynthesisRequest(
  args: VideoArgs,
  media: readonly MediaItem[],
  model: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: args.prompt }
  if (media.length > 0) input.media = media.map(item => ({ type: item.type, url: item.url }))
  const parameters: Record<string, unknown> = {
    resolution: args.resolution,
    duration: args.seconds,
  }
  if (args.ratio !== undefined) parameters.ratio = args.ratio
  if (args.sound !== undefined) parameters.audio = args.sound
  return { model, input, parameters }
}
