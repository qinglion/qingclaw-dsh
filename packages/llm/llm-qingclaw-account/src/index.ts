/** QingClaw short-token authentication, model discovery, and model gating. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import { APP_IDENTITY, attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import {
  catalogModelInfo, createModelListingCache, refuseListedModel,
  resolveAdapterOptions, resolveListedCatalog,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  ListedCatalog, ListingEntry, ListingView, ModelListing, ResolvedDeepSeekOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { registerAccountAdapter } from './gateway-adapter.ts'
import { Config, plainOptions, resolveOptions } from './config.ts'
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

async function requestQingclawListing(url: string, token: string, signal: AbortSignal): Promise<ModelListing> {
  const headers = new Headers(attributionHeaders())
  headers.set(MODEL_TOKEN_HEADER, `Bearer ${token}`)
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
    entries.push({
      id,
      ...(isDefault ? { default: true } : {}),
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
  const tokens = new ModelTokenCache({ account: ctx.deepseekAccount, timeoutMs: () => settings().modelTokenTimeoutMs })
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
    credential: async () => await tokens.resolve(),
    load: async (url, token, signal) => {
      try {
        return await requestQingclawListing(url, token, signal)
      } catch (error) {
        if (error instanceof LlmError && error.failure.status === 401) tokens.reject(token)
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
      saveSelection(selection: { provider: string; model: string }): Promise<void>
    } | undefined
    if (preferred !== undefined && defaults !== undefined) {
      const current = defaults.currentSelection()
      if (current.provider === PROVIDER && current.model !== preferred) {
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
          description: 'Create a QingClaw video generation task with the default video model.',
          parameters: {
            prompt: { type: 'string', required: true, description: 'Video description.' },
            seconds: { type: 'string', description: 'Duration in seconds.' },
            size: { type: 'string', description: 'Output size, for example 1280x720.' },
          },
          output: textOutput,
          timeoutMs: 60_000,
          execute: async (args: { prompt: string; seconds?: string; size?: string }) => await mediaRequest(
            '/video/api/v1/services/aigc/video-generation/video-synthesis',
            {
              model: settings().videoModel,
              input: { prompt: args.prompt },
              parameters: {
                duration: Number(args.seconds ?? 5),
                resolution: args.size?.includes('1080') === true ? '1080P' : args.size?.includes('720') === true ? '720P' : '480P',
              },
            },
            { 'X-DashScope-Async': 'enable' },
          ),
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
