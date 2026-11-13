/** QingClaw short-token authentication, model discovery, and model gating. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import { ACCOUNT_QUOTA_EXCEEDED_CODE, APP_IDENTITY, LlmError, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import {
  catalogModelInfo, createModelListingCache, refuseListedModel, registerDeepSeekProvider, requestModelListing,
  resolveAdapterOptions, resolveListedCatalog,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  DeepSeekRequestAuth, ListedCatalog, ListingView, ModelListing, ResolvedDeepSeekOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { Config, plainOptions, resolveOptions } from './config.ts'
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

export function apply(ctx: Context, config: Config): void {
  const settings = () => resolveOptions(plainOptions(config))
  settings()
  const tokens = new ModelTokenCache({ account: ctx.deepseekAccount, timeoutMs: () => settings().modelTokenTimeoutMs })
  ctx.effect(() => () => tokens.dispose(), 'llm-qingclaw-account: model token cache')
  ctx.on('deepseek-account/signed-out', () => { tokens.clear() })

  const supported = resolveAdapterOptions({}).models
  const resolveAuth = async (_connection: ResolvedDeepSeekOptions): Promise<DeepSeekRequestAuth> => {
    const token = await tokens.resolve()
    if (token === undefined) {
      throw new LlmError('Sign in to QingClaw to use the account provider.', 'ACCOUNT_SIGN_IN_REQUIRED')
    }
    return {
      headers: { [MODEL_TOKEN_HEADER]: `Bearer ${token}` },
      onRequestError: (error) => {
        if (!(error instanceof LlmError)) return Promise.resolve(error)
        if (error.code === QUOTA_EXCEEDED_CODE) {
          return Promise.resolve(new LlmError(error.message, ACCOUNT_QUOTA_EXCEEDED_CODE, { ...error.failure, cause: error }))
        }
        if (error.failure.status !== 401) return Promise.resolve(error)
        tokens.reject(token)
        return Promise.resolve(new LlmError(error.message, 'ACCOUNT_TOKEN_INVALID', { ...error.failure, cause: error }))
      },
    }
  }

  const catalog = createModelListingCache(ctx, name, PROVIDER, {
    settings: () => settings().catalog,
    credential: async () => await tokens.resolve(),
    load: async (url, token, signal) => {
      try {
        return await requestModelListing(url, { [MODEL_TOKEN_HEADER]: `Bearer ${token}` }, signal)
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
      supported,
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
