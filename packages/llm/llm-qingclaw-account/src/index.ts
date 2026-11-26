/** QingClaw short-token authentication, model discovery, and model gating. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import { APP_IDENTITY, attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import {
  catalogModelInfo, createModelListingCache, listedRate, refuseListedModel,
  resolveAdapterOptions, resolveListedCatalog,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  ListedCatalog, ListingEntry, ListingView, ModelListing, ResolvedDeepSeekOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { registerAccountAdapter } from './gateway-adapter.ts'
import { Config, plainOptions, resolveOptions } from './config.ts'
import {
  dataUrlOf, imageMediaTypeOf, isHostedReference, MAX_IMAGE_BYTES, mediaKindOf, MediaArgumentError,
  readVideoArgs, VIDEO_SYNTHESIS_PATH, videoSynthesisRequest,
} from './media.ts'
import type { MediaItem, MediaType, VideoArgs } from './media.ts'
import { ModelKeyCache } from './model-key.ts'
import { ModelTokenCache } from './model-token.ts'
import { installTurnUsageRefresh } from './turn-usage.ts'

export { Config, plainOptions, resolveOptions } from './config.ts'
export const name = 'llm-qingclaw-account'
export const inject = ['llm', 'deepseekAccount']

const PROVIDER = 'deepseek-account'
const LOG_TAG = '[llm-qingclaw-account]'
const MODEL_TOKEN_HEADER = 'x-dsh-auth-token'

/** Protocol settings plus the catalog resolved for the same operation. */
interface AccountConnection extends ResolvedDeepSeekOptions {
  readonly catalog: ListedCatalog
}

/** Filesystem operations the media tools need, declared structurally to keep the dependency optional. */
interface MediaFileSystem {
  resolve(path: string, options: { signal?: AbortSignal }): Promise<object>
  readBytes(target: object, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
}

async function requestQingclawListing(url: string, credential: Readonly<Record<string, string>>, signal: AbortSignal): Promise<ModelListing> {
  const headers = new Headers(attributionHeaders())
  for (const [name, value] of Object.entries(credential)) headers.set(name, value)
  headers.set('accept', 'application/json')
  let response: Response
  try {
    response = await fetch(url, { headers, signal, redirect: 'error' })
  } catch (error) {
    throw new LlmError(`could not reach ${url}`, 'TRANSPORT', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(`${url} answered HTTP ${response.status}`, `HTTP_${response.status}`, { status: response.status })
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new LlmError(`${url} returned invalid JSON`, 'INVALID_RESPONSE', { cause: error })
  }
  const data = typeof body === 'object' && body !== null && Array.isArray(Reflect.get(body, 'data'))
    ? Reflect.get(body, 'data') as unknown[]
    : []
  const entries: ListingEntry[] = []
  let skipped = 0
  for (const item of data) {
    if (typeof item !== 'object' || item === null) { skipped += 1; continue }
    const id: unknown = Reflect.get(item, 'id')
    if (typeof id !== 'string' || id.length === 0) { skipped += 1; continue }
    const isDefault = Reflect.get(item, 'default') === true
    const rawModalities: unknown = Reflect.get(item, 'input_modalities')
    const inputModalities = Array.isArray(rawModalities)
      ? rawModalities.filter((value): value is 'text' | 'image' => value === 'text' || value === 'image')
      : []
    // The website prices each model against the deployed default, so the
    // listing carries the multiple the selector shows beside the name.
    const rate = listedRate(Reflect.get(item, 'rate'))
    entries.push({
      id,
      ...(isDefault ? { default: true } : {}),
      ...(rate === undefined ? {} : { rate }),
      requirement: { kind: 'none' },
      capabilities: {
        usable: true,
        facts: {
          inputModalities: inputModalities.length > 0 ? inputModalities : ['text'],
          maxOutputTokens: 8192,
        },
      },
    })
  }
  return { entries, skipped }
}

export function apply(ctx: Context, config: Config): void {
  const settings = () => resolveOptions(plainOptions(config))
  settings()
  installTurnUsageRefresh(ctx, PROVIDER)
  const tokens = new ModelTokenCache({
    account: ctx.deepseekAccount,
    rejectUrl: () => settings().protocol.baseURL,
    timeoutMs: () => settings().modelTokenTimeoutMs,
  })
  const keys = new ModelKeyCache({ account: ctx.deepseekAccount, timeoutMs: () => settings().modelTokenTimeoutMs })
  ctx.effect(() => () => Promise.all([tokens.dispose(), keys.dispose()]), 'llm-qingclaw-account: credential caches')
  ctx.on('deepseek-account/signed-out', () => { tokens.clear(); keys.clear() })

  // The website catalog is the only model source: it decides which models exist,
  // their order, and which one is the default, so adding or retiring a model
  // needs no client release. A model is displayed under its catalog id; the
  // provider keeps no display names of its own.
  const supportedFor = (view: ListingView) => resolveAdapterOptions({
    models: (view.listing?.entries ?? []).map(entry => ({ id: entry.id })),
  }).models
  const catalog = createModelListingCache(ctx, name, PROVIDER, {
    settings: () => settings().catalog,
    credential: async () => {
      const token = await tokens.resolve()
      return token === undefined ? undefined : { [MODEL_TOKEN_HEADER]: `Bearer ${token}` }
    },
    load: async (url, credential, signal) => {
      try {
        return await requestQingclawListing(url, credential, signal)
      } catch (error) {
        if (error instanceof LlmError && error.failure.status === 401) {
          const rejected = credential[MODEL_TOKEN_HEADER]
          if (rejected !== undefined && rejected.startsWith('Bearer ')) tokens.reject(rejected.slice('Bearer '.length))
        }
        throw error
      }
    },
  })
  let loggedListing: ModelListing | undefined
  const connectionOf = (view: ListingView): AccountConnection => {
    const resolved = settings()
    const result = resolveListedCatalog({
      listing: view.listing?.entries,
      supported: supportedFor(view),
      overrides: resolved.modelOverrides,
      routeMaxTokens: resolved.protocol.maxTokens,
      clientVersion: APP_IDENTITY.version,
    })
    const preferred = view.listing?.entries.find(entry => Reflect.get(entry, 'default') === true)?.id
    const defaults = ctx.get('agentDefaultModel') as {
      currentSelection(): { provider: string; model: string }
      isUserSelected(): boolean
      saveSelection(selection: { provider: string; model: string }): Promise<void>
    } | undefined
    if (preferred !== undefined && defaults !== undefined) {
      const current = defaults.currentSelection()
      // The website default applies until the user saves a choice of their own;
      // a remembered selection survives refreshes unless its model leaves the catalog.
      const listed = result.offered.some(model => model.id === current.model)
      if (current.provider === PROVIDER && current.model !== preferred && (!defaults.isUserSelected() || !listed)) {
        void defaults.saveSelection({ provider: PROVIDER, model: preferred })
      }
    }
    if (view.listing !== loggedListing) {
      loggedListing = view.listing
      for (const problem of result.problems) console.warn(LOG_TAG, problem)
    }
    return { ...resolved.protocol, models: result.resolution, catalog: result }
  }

  const toolRegistry = ctx.get('tools') as {
    register(definition: Record<string, unknown>): () => void
  } | undefined
  if (toolRegistry !== undefined) {
    const mediaRequest = async (
      path: string,
      body: Record<string, unknown>,
      headers: Record<string, string> = {},
      signal?: AbortSignal,
    ): Promise<string> => {
      const apiKey = await keys.resolve()
      if (apiKey === undefined) throw new LlmError('Sign in to QingClaw to generate media.', 'ACCOUNT_SIGN_IN_REQUIRED')
      const origin = new URL(settings().protocol.baseURL).origin
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      })
      const text = await response.text()
      if (!response.ok) throw new LlmError(`QingClaw media request failed: ${response.status} ${text.slice(0, 300)}`, 'UNKNOWN')
      return text
    }
    const files = ctx.get('fs') as MediaFileSystem | undefined
    /**
     * Turn one media argument into a reference the gateway fetches or decodes.
     * @param value - hosted URL, data URL, or local path.
     * @param type - media slot the value fills.
     * @param signal - cancels a local read.
     * @returns the value to send in the request body.
     */
    const mediaReference = async (value: string, type: MediaType, signal?: AbortSignal): Promise<string> => {
      if (isHostedReference(value)) return value
      if (mediaKindOf(type) !== 'image') {
        throw new MediaArgumentError(type + ' must be an https or oss:// URL; only images are read from local files')
      }
      const mediaType = imageMediaTypeOf(value)
      if (mediaType === undefined) {
        throw new MediaArgumentError('image must be an https URL, an oss:// URL, a data URL, or a local .jpg/.png/.webp/.bmp file')
      }
      if (files === undefined) throw new MediaArgumentError('local images need the session filesystem service')
      const target = await files.resolve(value, signal === undefined ? {} : { signal })
      return dataUrlOf(await files.readBytes(target, signal, MAX_IMAGE_BYTES), mediaType)
    }
    /**
     * Resolve every media slot of one call into the array the gateway routes on.
     * @param call - validated arguments.
     * @param signal - cancels local reads.
     * @returns media slots in prompt-reference order.
     */
    const collectMedia = async (call: VideoArgs, signal?: AbortSignal): Promise<MediaItem[]> => {
      const slots: { type: MediaType; value: string }[] = [
        ...(call.firstFrame === undefined ? [] : [{ type: 'first_frame' as const, value: call.firstFrame }]),
        ...(call.lastFrame === undefined ? [] : [{ type: 'last_frame' as const, value: call.lastFrame }]),
        ...call.referenceImages.map(value => ({ type: 'reference_image' as const, value })),
        ...call.referenceVideos.map(value => ({ type: 'reference_video' as const, value })),
        ...call.referenceAudios.map(value => ({ type: 'reference_audio' as const, value })),
      ]
      const media: MediaItem[] = []
      for (const slot of slots) media.push({ type: slot.type, url: await mediaReference(slot.value, slot.type, signal) })
      return media
    }
    const textOutput = {
      schema: { type: 'string' as const },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
    }
    ctx.effect(() => {
      const dispose = [
        toolRegistry.register({
          name: 'image_generate',
          description: 'Generate an image with the default QingClaw image model and return the gateway result.',
          parameters: {
            prompt: { type: 'string', required: true, description: 'Complete visual description.' },
            size: { type: 'string', description: 'Image size, for example 1024x1024.' },
            n: { type: 'integer', description: 'Number of images, 1-4.' },
          },
          output: textOutput,
          timeoutMs: 180_000,
          execute: async (args: { prompt: string; size?: string; n?: number }) => await mediaRequest('/v1/images/generations', {
            model: settings().imageModel,
            prompt: args.prompt,
            ...(args.size === undefined ? {} : { size: args.size }),
            ...(args.n === undefined ? {} : { n: args.n }),
          }),
        }),
        toolRegistry.register({
          name: 'video_generate',
          description: 'Create a QingClaw video task with the default video model. '
            + 'Pass firstFrame to animate a picture, or images/videos/audios to compose from references.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'What the clip shows: subject, action, camera movement, and style. '
                  + 'Address reference media as "image 1", "video 1", or "audio 1" in send order.',
              },
              seconds: {
                type: 'string',
                description: 'Whole seconds from 2 to 30, or "auto" for the model-chosen length. Defaults to 5.',
              },
              size: {
                type: 'string',
                description: 'Output size such as 1280x720; 480, 720, and 1080 name the resolution tier. Defaults to 480P.',
              },
              ratio: {
                type: 'string',
                description: 'Frame ratio: adaptive, 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16. Omit to follow the media.',
              },
              sound: {
                type: 'boolean',
                description: 'Whether the clip carries an audio track. Defaults to true.',
              },
              firstFrame: {
                type: 'string',
                description: 'Picture the clip starts from: an https, oss://, or data: URL, or a local image path.',
              },
              lastFrame: {
                type: 'string',
                description: 'Picture the clip ends on, in the same forms as firstFrame.',
              },
              images: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 10 reference images: URLs or local image paths.',
              },
              videos: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 5 reference videos: hosted mp4/mov URLs, 15 seconds in total.',
              },
              audios: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 5 reference audio tracks: hosted mp3/wav URLs, 15 seconds in total.',
              },
            },
            required: ['prompt'],
            additionalProperties: false,
          },
          output: textOutput,
          timeoutMs: 60_000,
          execute: async (args: unknown, exec?: { signal?: AbortSignal }) => {
            const call = readVideoArgs(args)
            const media = await collectMedia(call, exec?.signal)
            return await mediaRequest(
              VIDEO_SYNTHESIS_PATH,
              videoSynthesisRequest(call, media, settings().videoModel),
              { 'X-DashScope-Async': 'enable' },
              exec?.signal,
            )
          },
        }),
        toolRegistry.register({
          name: 'audio_generate',
          description: 'Generate speech with the default QingClaw speech model and return the gateway result.',
          parameters: {
            text: { type: 'string', required: true, description: 'Text to synthesize.' },
            voice: { type: 'string', description: 'Voice name, default Cherry.' },
          },
          output: textOutput,
          timeoutMs: 120_000,
          execute: async (args: { text: string; voice?: string }) => await mediaRequest(
            '/audio/api/v1/services/aigc/multimodal-generation/generation',
            {
              model: settings().audioModel,
              input: { text: args.text, voice: args.voice ?? 'Cherry' },
            },
          ),
        }),
        toolRegistry.register({
          name: 'video_get',
          description: 'Read one QingClaw video task by id.',
          parameters: { id: { type: 'string', required: true, description: 'Video task id.' } },
          output: textOutput,
          timeoutMs: 30_000,
          execute: async (args: { id: string }) => {
            const apiKey = await keys.resolve()
            if (apiKey === undefined) throw new LlmError('Sign in to QingClaw to read media.', 'ACCOUNT_SIGN_IN_REQUIRED')
            const origin = new URL(settings().protocol.baseURL).origin
            const response = await fetch(`${origin}/video/api/v1/tasks/${encodeURIComponent(args.id)}`, {
              headers: { authorization: `Bearer ${apiKey}` },
            })
            const text = await response.text()
            if (!response.ok) throw new LlmError(`QingClaw video status failed: ${response.status} ${text.slice(0, 300)}`, 'UNKNOWN')
            return text
          },
        }),
      ]
      return () => { for (const remove of dispose) remove() }
    }, 'llm-qingclaw-account: media tools')
  }

  const entry = {
    provider: PROVIDER,
    displayName: 'QingClaw Account',
    settingsNs: ctx.fiber.entry?.options.id ?? name,
    settingsPath: [],
  }
  const directory = ctx.llm.registerConfigurableProviders([entry])
  let reportedError: string | undefined
  const discovered = (view: ListingView): AccountConnection => {
    const connection = connectionOf(view)
    const error = connection.catalog.overrideErrors.length === 0 ? undefined : connection.catalog.overrideErrors.join('; ')
    if (error !== reportedError) {
      reportedError = error
      directory.replace([error === undefined ? entry : { ...entry, error }])
    }
    return connection
  }

  registerAccountAdapter<AccountConnection>(ctx, PROVIDER, keys, {
    providerName: 'QingClaw Account',
    options: () => connectionOf(catalog.current()),
    connect: async signal => connectionOf(await catalog.view(settings().catalog, signal)),
    admit: (connection, model) => { refuseListedModel(model, connection.catalog.refusals.get(model)) },
    discoverModels: async (provider) => {
      const view = await catalog.view(settings().catalog)
      if (!view.authenticated) return []
      const { offered, badges } = discovered(view).catalog
      return offered.map(model => catalogModelInfo(provider, model, badges.get(model.id)))
    },
  })
}
