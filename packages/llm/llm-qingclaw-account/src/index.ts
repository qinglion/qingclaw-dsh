/** QingClaw short-token authentication, model discovery, and model gating. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import { ACCOUNT_QUOTA_EXCEEDED_CODE, APP_IDENTITY, attributionHeaders, LlmError, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import {
  catalogModelInfo, createModelListingCache, refuseListedModel, registerDeepSeekProvider,
  resolveAdapterOptions, resolveListedCatalog,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  DeepSeekRequestAuth, ListedCatalog, ListingEntry, ListingView, ModelListing, ResolvedDeepSeekOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { Config, plainOptions, resolveOptions } from './config.ts'
import { ModelKeyCache } from './model-key.ts'
import { ModelTokenCache } from './model-token.ts'

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
    const id = Reflect.get(item, 'id')
    if (typeof id !== 'string' || id.length === 0) { skipped += 1; continue }
    const name = Reflect.get(item, 'name')
    entries.push({
      id,
      ...(typeof name === 'string' && name.length > 0 ? { name } : {}),
      requirement: { kind: 'none' },
      capabilities: {
        usable: true,
        facts: { inputModalities: ['text'], maxOutputTokens: 8192 },
      },
    })
  }
  return { entries, skipped }
}

export function apply(ctx: Context, config: Config): void {
  const settings = () => resolveOptions(plainOptions(config))
  settings()
  const tokens = new ModelTokenCache({ account: ctx.deepseekAccount, timeoutMs: () => settings().modelTokenTimeoutMs })
  const keys = new ModelKeyCache({ account: ctx.deepseekAccount, timeoutMs: () => settings().modelTokenTimeoutMs })
  ctx.effect(() => () => Promise.all([tokens.dispose(), keys.dispose()]), 'llm-qingclaw-account: credential caches')
  ctx.on('deepseek-account/signed-out', () => { tokens.clear(); keys.clear() })

  // Keep a small, verified catalog in the QingClaw integration plug-in so the
  // upstream client stays untouched even while the gateway has no /models route.
  // The gateway's /v1/models reflects the upstream catalog, including models
  // that our Bailian account has not activated and non-chat modalities. Keep
  // the offered catalog to chat models we have verified against the gateway.
  const baseSupported = resolveAdapterOptions({
    models: [
      { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash', inputModalities: ['text'] },
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (latest)', inputModalities: ['text'] },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputModalities: ['text'] },
      { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', inputModalities: ['text'] },
      { id: 'glm-5.3', name: 'GLM 5.3', inputModalities: ['text'] },
      { id: 'glm-5.3-prime', name: 'GLM 5.3 Prime', inputModalities: ['text'] },
      { id: 'qwen-plus', name: 'Qwen Plus', inputModalities: ['text'] },
      { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', inputModalities: ['text'] },
      { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max', inputModalities: ['text'] },
    ],
  }).models
  const supportedFor = (view: ListingView) => {
    const entries = view.listing?.entries
    if (entries === undefined) return baseSupported
    const listed = new Set(entries.map(entry => entry.id))
    return baseSupported.filter(model => listed.has(model.id))
  }
  const resolveAuth = async (_connection: ResolvedDeepSeekOptions): Promise<DeepSeekRequestAuth> => {
    const apiKey = await keys.resolve()
    if (apiKey === undefined) {
      throw new LlmError('Sign in to QingClaw to use the account provider.', 'ACCOUNT_SIGN_IN_REQUIRED')
    }
    return {
      headers: { Authorization: `Bearer ${apiKey}` },
      onRequestError: (error) => {
        if (!(error instanceof LlmError)) return Promise.resolve(error)
        if (error.code === QUOTA_EXCEEDED_CODE) {
          return Promise.resolve(new LlmError(error.message, ACCOUNT_QUOTA_EXCEEDED_CODE, { ...error.failure, cause: error }))
        }
        if (error.failure.status !== 401) return Promise.resolve(error)
        keys.reject(apiKey)
        return Promise.resolve(new LlmError(error.message, 'ACCOUNT_TOKEN_INVALID', { ...error.failure, cause: error }))
      },
    }
  }

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
    if (view.listing !== loggedListing) {
      loggedListing = view.listing
      for (const problem of result.problems) console.warn(LOG_TAG, problem)
    }
    return { ...resolved.protocol, models: result.resolution, catalog: result }
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

  registerDeepSeekProvider<AccountConnection>(ctx, PROVIDER, {
    providerName: 'QingClaw Account',
    options: () => connectionOf(catalog.current()),
    connect: async signal => connectionOf(await catalog.view(settings().catalog, signal)),
    resolveAuth,
    admit: (connection, model) => { refuseListedModel(model, connection.catalog.refusals.get(model)) },
    discoverModels: async (provider) => {
      const view = await catalog.view(settings().catalog)
      if (!view.authenticated) return []
      const { offered, badges } = discovered(view).catalog
      return offered.map(model => catalogModelInfo(provider, model, badges.get(model.id)))
    },
  })
}
