/** Video tool arguments, media slots, and the request body the gateway receives. */
import { Buffer } from 'node:buffer'
import { Context } from '@deepseek-ai/cordis'
import type { AccountRequestCredential, DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as QingClawAccount from '../src/index.ts'
import {
  dataUrlOf, imageMediaTypeOf, isHostedReference, MAX_IMAGE_BYTES, mediaKindOf, MediaArgumentError,
  readVideoArgs, resolutionOf, SMART_DURATION, VIDEO_RATIOS, videoSynthesisRequest,
} from '../src/media.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
})

/** One tool as the plugin registered it. */
interface RegisteredTool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  execute(args: unknown, exec?: { signal?: AbortSignal }): Promise<unknown>
}

/** Filesystem stub standing in for the session provider. */
interface FakeFileSystem {
  resolve(path: string, options: { signal?: AbortSignal }): Promise<object>
  readBytes(target: object, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
}

async function mount(options: { fs?: FakeFileSystem } = {}) {
  const registered: RegisteredTool[] = []
  const session: PlatformSession = {
    origin: 'https://platform.test',
    token: 'long-lived-device-session',
    userId: null,
    requestHeaders: {},
  }
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'refreshUsage'> & {
    resolveRequestCredential: (url: string) => Promise<AccountRequestCredential>
  } = {
    getPlatformSession: async (): Promise<PlatformSession> => session,
    refreshUsage: async (): Promise<void> => {},
    resolveRequestCredential: async () => ({
      headers: {}, revoked: new AbortController().signal, reject: async (): Promise<void> => {},
    }),
  }
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  ctx.provide('deepseekAccount', account as DeepSeekAccount)
  ctx.provide('tools', {
    register: (definition: RegisteredTool) => {
      registered.push(definition)
      return () => {}
    },
  })
  if (options.fs !== undefined) ctx.provide('fs', options.fs)
  await ctx.plugin(QingClawAccount, { baseURL: 'https://gateway.test/v1' })
  const video = registered.find(tool => tool.name === 'video_generate')
  if (video === undefined) throw new Error('video_generate was not registered')
  return { ctx, video, registered }
}

/** Answer the key exchange so media requests can authenticate. */
function keyExchange(): Response {
  return Response.json({ code: 0, data: { biz_code: 0, biz_data: { api_key: 'gateway-key-1' } } })
}

/** Answer the website's media authorization and settlement calls. */
function platformResponse(path: string): Response | undefined {
  if (path === '/auth-api/v0/dsh/media/authorize') {
    return Response.json({
      code: 0,
      data: { biz_code: 0, biz_data: { charge_id: 'mc_test', ticket: 'media-ticket', remaining: 1_000 } },
    })
  }
  if (path.endsWith('/media/settle') || path.endsWith('/media/refund')) {
    return Response.json({
      code: 0,
      data: { biz_code: 0, biz_data: { charge_id: 'mc_test', status: 'charged', remaining: 1_000 } },
    })
  }
  return undefined
}

describe('video generation arguments', () => {
  it('defaults the clip to five seconds at 480P with no media', () => {
    expect(readVideoArgs({ prompt: 'a whale' })).toEqual({
      prompt: 'a whale', seconds: 5, resolution: '480P',
      referenceImages: [], referenceVideos: [], referenceAudios: [],
    })
  })

  it('reads the duration from a number, a numeric string, or auto', () => {
    expect(readVideoArgs({ prompt: 'a whale', seconds: 9 }).seconds).toBe(9)
    expect(readVideoArgs({ prompt: 'a whale', seconds: '12' }).seconds).toBe(12)
    expect(readVideoArgs({ prompt: 'a whale', seconds: 'auto' }).seconds).toBe(SMART_DURATION)
  })

  it.each(['0', '1', '31', '2.5', 'soon'])('rejects the duration %s', (seconds) => {
    expect(() => readVideoArgs({ prompt: 'a whale', seconds })).toThrow(MediaArgumentError)
  })

  it('requires a prompt', () => {
    expect(() => readVideoArgs({})).toThrow('prompt is required')
    expect(() => readVideoArgs({ prompt: '   ' })).toThrow('prompt is required')
  })

  it.each([
    ['1280x720', '720P'],
    ['1920x1080', '1080P'],
    ['720p', '720P'],
    ['640x480', '480P'],
  ])('maps %s onto the %s tier', (size, expected) => {
    expect(resolutionOf(size)).toBe(expected)
  })

  it('rejects a size that names no tier', () => {
    expect(() => resolutionOf('wide')).toThrow('480, 720, or 1080')
  })

  it.each(VIDEO_RATIOS)('accepts the ratio %s', (ratio) => {
    expect(readVideoArgs({ prompt: 'a whale', ratio }).ratio).toBe(ratio)
  })

  it('reads auto as the adaptive ratio and rejects an unknown one', () => {
    expect(readVideoArgs({ prompt: 'a whale', ratio: 'auto' }).ratio).toBe('adaptive')
    expect(() => readVideoArgs({ prompt: 'a whale', ratio: '2:1' })).toThrow('ratio must be one of')
  })

  it('refuses to mix frame animation with reference composition', () => {
    expect(() => readVideoArgs({
      prompt: 'a whale', firstFrame: 'https://cdn.test/a.png', images: ['https://cdn.test/b.png'],
    })).toThrow('one call is either a frame animation or a reference composition')
  })

  it('caps the reference slots', () => {
    const images = Array.from({ length: 11 }, (_value, index) => `https://cdn.test/${index}.png`)
    expect(() => readVideoArgs({ prompt: 'a whale', images })).toThrow('at most 10')
    expect(() => readVideoArgs({ prompt: 'a whale', images: images.slice(0, 10) })).not.toThrow()
  })

  it('keeps first and last frame separate from the reference lists', () => {
    const call = readVideoArgs({
      prompt: 'a whale', firstFrame: 'https://cdn.test/first.png', lastFrame: 'https://cdn.test/last.png',
    })
    expect(call.firstFrame).toBe('https://cdn.test/first.png')
    expect(call.lastFrame).toBe('https://cdn.test/last.png')
    expect(call.referenceImages).toEqual([])
  })
})

describe('video request body', () => {
  it('sends the prompt, duration, and resolution of a text-only clip', () => {
    const call = readVideoArgs({ prompt: 'a whale', seconds: 6, size: '1280x720' })
    expect(videoSynthesisRequest(call, [], 'wan3.0-video-prime')).toEqual({
      model: 'wan3.0-video-prime',
      input: { prompt: 'a whale' },
      parameters: { resolution: '720P', duration: 6 },
    })
  })

  it('sends media slots in prompt-reference order', () => {
    const call = readVideoArgs({
      prompt: 'image 1 runs past video 1',
      images: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
      videos: ['https://cdn.test/run.mp4'],
    })
    const body = videoSynthesisRequest(call, [
      { type: 'reference_image', url: 'https://cdn.test/a.png' },
      { type: 'reference_image', url: 'https://cdn.test/b.png' },
      { type: 'reference_video', url: 'https://cdn.test/run.mp4' },
    ], 'wan3.0-video-prime')
    expect(body.input).toEqual({
      prompt: 'image 1 runs past video 1',
      media: [
        { type: 'reference_image', url: 'https://cdn.test/a.png' },
        { type: 'reference_image', url: 'https://cdn.test/b.png' },
        { type: 'reference_video', url: 'https://cdn.test/run.mp4' },
      ],
    })
  })

  it('sends the ratio and the audio switch when the call declares them', () => {
    const call = readVideoArgs({ prompt: 'a whale', ratio: '9:16', sound: false })
    expect(videoSynthesisRequest(call, [], 'wan3.0-video-prime').parameters)
      .toEqual({ resolution: '480P', duration: 5, ratio: '9:16', audio: false })
  })

  it('carries the smart duration through as -1', () => {
    const call = readVideoArgs({ prompt: 'a whale', seconds: 'auto' })
    expect(videoSynthesisRequest(call, [], 'wan3.0-video-prime').parameters)
      .toMatchObject({ duration: SMART_DURATION })
  })
})

describe('media references', () => {
  it.each([
    ['first_frame', 'image'],
    ['last_frame', 'image'],
    ['reference_image', 'image'],
    ['reference_video', 'video'],
    ['reference_audio', 'audio'],
  ] as const)('classifies the %s slot as %s', (type, kind) => {
    expect(mediaKindOf(type)).toBe(kind)
  })

  it.each([
    ['https://cdn.test/a.png', true],
    ['oss://bucket/a.png', true],
    ['data:image/png;base64,AAAA', true],
    ['/Users/me/画面.jpg', false],
  ])('classifies %s as hosted: %s', (value, expected) => {
    expect(isHostedReference(value)).toBe(expected)
  })

  it.each([
    ['/tmp/shot.JPG', 'image/jpeg'],
    ['/tmp/shot.png', 'image/png'],
    ['/tmp/shot.webp', 'image/webp'],
    ['/tmp/theme.mp3', undefined],
    ['/tmp/no-extension', undefined],
  ])('maps the image %s onto %s', (path, expected) => {
    expect(imageMediaTypeOf(path)).toBe(expected)
  })

  it('encodes bytes as a decodable data URL', () => {
    const bytes = new Uint8Array([1, 2, 3, 255])
    const url = dataUrlOf(bytes, 'image/png')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(Buffer.from(url.slice('data:image/png;base64,'.length), 'base64')).toEqual(Buffer.from(bytes))
  })
})

describe('video_generate tool', () => {
  it('sends the exact gateway body for a text-only clip', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_key') return keyExchange()
      const platform = platformResponse(path)
      if (platform !== undefined) return platform
      if (path === '/video/api/v1/services/aigc/video-generation/video-synthesis') {
        expect(request.headers.get('x-dashscope-async')).toBe('enable')
        expect(request.headers.get('x-qingclaw-media-ticket')).toBe('Bearer media-ticket')
        bodies.push(await request.json() as Record<string, unknown>)
        return Response.json({ output: { task_id: 'task-1', task_status: 'PENDING' } })
      }
      throw new Error('unexpected request ' + request.url)
    })
    const { video } = await mount()
    const answer = await video.execute({ prompt: 'a whale runs along the shore', seconds: '7', size: '1920x1080' })
    expect(bodies).toEqual([{
      model: 'wan3.0-video-prime',
      input: { prompt: 'a whale runs along the shore' },
      parameters: { resolution: '1080P', duration: 7 },
    }])
    expect(JSON.parse(String(answer))).toMatchObject({ output: { task_id: 'task-1' } })
  })

  it('reads a local first frame and sends it as a first_frame data URL', async () => {
    const bytes = new Uint8Array([9, 8, 7])
    const reads: number[] = []
    const fs: FakeFileSystem = {
      resolve: async (path: string) => {
        expect(path).toBe('/tmp/character.jpg')
        return {}
      },
      readBytes: async (_target, _signal, maxBytes) => {
        reads.push(maxBytes)
        return bytes
      },
    }
    const bodies: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_key') return keyExchange()
      const platform = platformResponse(path)
      if (platform !== undefined) return platform
      bodies.push(await request.json() as Record<string, unknown>)
      return Response.json({ output: { task_id: 'task-2', task_status: 'PENDING' } })
    })
    const { video } = await mount({ fs })
    await video.execute({ prompt: 'the character runs', firstFrame: '/tmp/character.jpg' })
    expect(reads).toEqual([MAX_IMAGE_BYTES])
    const input = bodies[0]?.input as Record<string, unknown>
    expect(input.media).toEqual([{
      type: 'first_frame',
      url: 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64'),
    }])
  })

  it("surfaces the website's insufficient-credit message without calling the gateway", async () => {
    const requests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      requests.push(path)
      if (path === '/auth-api/v0/dsh/model_key') return keyExchange()
      if (path === '/auth-api/v0/dsh/media/authorize') {
        return Response.json({
          code: 0,
          data: {
            biz_code: 1,
            biz_msg: 'insufficient_credits',
            biz_data: { required: 2_250, available: 1_000, message: '额度不足，无法生成。请升级专业版或购买更多额度。' },
          },
        }, { status: 402 })
      }
      throw new Error('unexpected request ' + request.url)
    })
    const { video } = await mount()
    await expect(video.execute({ prompt: 'a whale', seconds: 5 }))
      .rejects.toThrow('额度不足，无法生成')
    expect(requests).not.toContain('/video/api/v1/services/aigc/video-generation/video-synthesis')
  })

  it('refuses a local reference video, which the gateway fetches by URL only', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => keyExchange())
    const { video } = await mount()
    await expect(video.execute({ prompt: 'restyle the shot', videos: ['/tmp/shot.mp4'] }))
      .rejects.toThrow('only images are read from local files')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects a local image without a supported extension before any request', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => keyExchange())
    const { video } = await mount()
    await expect(video.execute({ prompt: 'the character runs', firstFrame: '/tmp/character.tiff' }))
      .rejects.toThrow('local .jpg/.png/.webp/.bmp file')
    expect(request).not.toHaveBeenCalled()
  })
})
