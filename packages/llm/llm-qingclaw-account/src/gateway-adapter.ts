/** OpenAI-compatible chat for the signed-in QingClaw account. */
import type {} from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { deepEqual } from '@deepseek-ai/cosmokit'
import { getOrCreateAnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import {
  ACCOUNT_QUOTA_EXCEEDED_CODE, LlmAdapter, LlmError, QUOTA_EXCEEDED_CODE,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { providerError } from '@deepseek-ai/dsh-llm-deepseek'
import type { ResolvedDeepSeekOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { createPiAiAdapterForProfile, type PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ModelKeyCache } from './model-key.ts'

interface AccountDirectory<C extends ResolvedDeepSeekOptions> {
  providerName: string
  options(): C
  connect(signal?: AbortSignal): Promise<C>
  admit(connection: C, model: string): void
  discoverModels(provider: string): Promise<LlmModelInfo[]>
}

/**
 * Register the account chat route while keeping discovery independent of the quota-gated credential.
 * @param ctx - plugin lifetime with the host LLM registry.
 * @param provider - stable account route used by saved sessions.
 * @param keys - request-bound credentials and gateway denial reconciliation.
 * @param directory - website-backed model catalog, admission rules, and current settings.
 */
export function registerAccountAdapter<C extends ResolvedDeepSeekOptions>(
  ctx: Context, provider: string, keys: ModelKeyCache, directory: AccountDirectory<C>,
): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  let last: { profile: PiAiProviderProfile; adapter: PiAiAdapter } | undefined
  let userId: ReturnType<typeof getOrCreateAnonymousUserId> | undefined
  const forModel = (connection: C, model: string): PiAiAdapter => {
    const entry = connection.models.find(item => item.id === model)
    const profile: PiAiProviderProfile = {
      api: 'openai-completions',
      baseURL: connection.baseURL,
      displayName: directory.providerName,
      streamIdleTimeoutMs: connection.streamIdleTimeoutMs,
      maxRequestImageBytes: connection.maxInlineRequestImageBytes,
      maxRequestImages: connection.maxImagesPerRequest,
      imageOffloadCountQuantum: connection.imageOffloadCountQuantum,
      ...(entry?.imagePixelBudget === undefined ? {} : {
        requestImagePixelBudget: entry.imagePixelBudget === 'low' ? 512 * 512 : entry.imagePixelBudget,
      }),
      ...(entry?.imageTargetBytes === undefined ? {} : { requestImageMaxBytes: entry.imageTargetBytes }),
      reasoning: connection.defaults.thinking === 'disabled' ? 'off' : connection.defaults.reasoningEffort ?? 'high',
      models: [{
        id: model,
        name: entry?.name ?? model,
        contextWindow: entry?.contextWindow ?? connection.defaultContextWindow,
        maxTokens: entry?.maxTokens ?? connection.maxTokens,
        input: entry?.inputModalities ?? ['text'],
        reasoningEfforts: connection.defaults.thinking === 'disabled' ? { off: null } : {
          off: null, low: 'low', high: 'high', max: 'max',
        },
      }],
      compat: {
        supportsStore: false, supportsDeveloperRole: false, supportsStrictMode: false,
        supportsUsageInStreaming: true, maxTokensField: 'max_tokens',
        thinkingFormat: 'qwen', supportsReasoningEffort: true, requiresReasoningContentOnAssistantMessages: true,
      },
    }
    // Each prepared call keeps its own immutable catalog/endpoint even if settings or identity change.
    if (last && deepEqual(profile, last.profile)) return last.adapter
    const adapter = createPiAiAdapterForProfile(ctx, provider, profile, {
      resolveApiKey: () => keys.resolve(),
      prepareHeaders: (request, headers) => {
        headers.set('x-deepseek-harness-user-id', userId ??= getOrCreateAnonymousUserId())
        if (request.sessionId !== undefined) headers.set('x-deepseek-harness-session-id', String(request.sessionId))
        if (request.purpose === 'compaction') headers.set('x-deepseek-harness-compact', '1')
        return headers
      },
    })
    last = { profile, adapter }
    return adapter
  }

  const account = new class extends LlmAdapter {
    override providerInfo() { return { id: provider, name: directory.providerName } }
    override providerRetryPolicy() { return directory.options().retryPolicy }
    override listModels(route: string) { return directory.discoverModels(route) }
    override async resolveModel(route: string, model: string, signal?: AbortSignal) {
      const connection = await directory.connect(signal)
      return forModel(connection, model).resolveModel(route, model, signal)
    }
    override imageRequestTarget(route: string, model: string, ref: Parameters<PiAiAdapter['imageRequestTarget']>[2]) {
      return forModel(directory.options(), model).imageRequestTarget(route, model, ref)
    }
    override async prepareCall(route: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
      const connection = await directory.connect(signal)
      directory.admit(connection, model)
      const adapter = forModel(connection, model)
      const info = await adapter.resolveModel(route, model, signal)
      return { model: info, stream: options => accountStream(adapter, keys, options, info.defaultMaxTokens) }
    }
    override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const connection = directory.options()
      directory.admit(connection, options.model)
      const cap = connection.models.find(item => item.id === options.model)?.maxTokens ?? connection.maxTokens
      return accountStream(forModel(connection, options.model), keys, options, cap)
    }
  }()
  const registration = ctx.llm.registerAdapter([provider], account)
  let registeredPolicy = account.providerRetryPolicy()
  ctx.on('loader/volatile-update', () => {
    let next: typeof registeredPolicy
    try { next = account.providerRetryPolicy() } catch (error) { ctx.logger.warn(error); return }
    if (deepEqual(next, registeredPolicy)) return
    registration.replace([provider])
    registeredPolicy = next
  })
}

/** Retain gateway status, Retry-After and request ids that the SDK otherwise flattens into a string. */
async function * accountStream(
  adapter: PiAiAdapter, keys: ModelKeyCache, options: GenerateOptions, defaultMaxTokens: number | undefined,
): AsyncGenerator<StreamChunk> {
  options.signal?.throwIfAborted()
  const binding = await keys.resolveBound()
  if (!binding) throw new LlmError('Sign in to QingClaw to use the account provider.', 'ACCOUNT_SIGN_IN_REQUIRED')
  const { stop, ...request } = options
  let failure: LlmError | undefined
  const chunks = adapter.stream({
    ...request, ...(request.maxTokens === undefined && defaultMaxTokens !== undefined ? { maxTokens: defaultMaxTokens } : {}),
  }, {
    apiKey: binding.key,
    ...(stop === undefined ? {} : { onPayload: (body: unknown) => ({ ...(body as object), stop }) }),
    fetch: async (input, init) => {
      const response = await fetch(input, { ...init, redirect: 'error' })
      if (!response.ok) {
        const text = await response.clone().text()
        let body: unknown
        try { body = JSON.parse(text) } catch { /* A gateway may return an unstructured HTTP error. */ }
        const error = providerError(body ?? { error: { message: `QingClaw model request failed (${response.status})` } },
          response.status, response.headers)
        const plainQuota = error.code === 'RATE_LIMIT' && error.failure.providerRetryAfterMs === undefined && text.trim() === 'quota exceeded'
        failure = error
        if (plainQuota || error.code === QUOTA_EXCEEDED_CODE) {
          await keys.reconcileQuota(binding)
          failure = new LlmError(plainQuota ? '网关返回额度不足，请刷新用量。' : error.message,
            ACCOUNT_QUOTA_EXCEEDED_CODE, { ...error.failure, cause: error })
        } else if (response.status === 401) {
          keys.reject(binding)
          failure = new LlmError(error.message, 'ACCOUNT_TOKEN_INVALID', { ...error.failure, cause: error })
        }
      }
      return response
    },
  })
  for await (const chunk of chunks) {
    if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
      if (failure) throw failure
      // Some providers reject quota in an SSE event after accepting the HTTP request.
      if (chunk.reason.failure.code === QUOTA_EXCEEDED_CODE) {
        await keys.reconcileQuota(binding)
        throw new LlmError(chunk.reason.failure.message, ACCOUNT_QUOTA_EXCEEDED_CODE, chunk.reason.failure)
      }
    }
    yield chunk
  }
}
