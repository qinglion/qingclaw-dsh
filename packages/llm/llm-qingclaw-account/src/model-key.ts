/** Per-user QingClaw gateway API-key exchange and caching. */
import { Buffer } from 'node:buffer'
import type { DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { z } from 'zod'

const KEY_PATH = '/auth-api/v0/dsh/model_key'
const RESPONSE_LIMIT_BYTES = 16_384
const TIMEOUT_CODE = 'QINGCLAW_MODEL_KEY_TIMEOUT'

const responseEnvelope = z.object({
  code: z.literal(0),
  data: z.object({
    biz_code: z.literal(0),
    biz_data: z.object({ api_key: z.string().min(1).max(4096) }),
  }),
})

const deniedResponse = z.object({
  data: z.object({ reason: z.string().optional(), message: z.string().optional(), remaining_tokens: z.number().optional() }),
})

interface CachedKey {
  readonly sessionKey: string
  readonly key: string
}

/** Dependencies of one API-key cache, injectable for tests. */
export interface ModelKeyCacheDependencies {
  readonly account: Pick<DeepSeekAccount, 'getPlatformSession' | 'refreshUsage'>
  readonly timeoutMs: () => number
  readonly request?: typeof fetch
}

function sessionKey(session: PlatformSession): string {
  return `${session.origin}\n${session.token}`
}

function invalidResponse(message: string, cause?: unknown): LlmError {
  return new LlmError(`QingClaw model-key response ${message}`, 'INVALID_RESPONSE', cause === undefined ? undefined : { cause })
}

function endpointFailure(status: number, detail?: string): LlmError {
  if (status === 401) return new LlmError('QingClaw model-key credential was rejected.', 'ACCOUNT_TOKEN_INVALID', { status })
  if (status === 403) return new LlmError(detail ?? 'QingClaw account has no active model entitlement.', 'HTTP_403', { status })
  if (status === 429) return new LlmError('QingClaw model-key exchange was rate limited.', 'RATE_LIMIT', { status })
  if (status >= 500) return new LlmError('QingClaw model-key service is unavailable.', 'SERVER', { status })
  return new LlmError(`QingClaw model-key endpoint answered HTTP ${status}.`, `HTTP_${status}`, { status })
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (Buffer.byteLength(text) > RESPONSE_LIMIT_BYTES) throw invalidResponse('exceeds the body limit')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw invalidResponse('is not JSON', error)
  }
}

/** In-memory owner of the long-lived per-user gateway API key. */
export class ModelKeyCache {
  private readonly account: ModelKeyCacheDependencies['account']
  private readonly timeoutMs: () => number
  private readonly request: typeof fetch
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<CachedKey>>()
  private cached: CachedKey | undefined
  private inflight: { readonly sessionKey: string; readonly promise: Promise<CachedKey> } | undefined
  private readonly reconciliations = new WeakMap<CachedKey, Promise<void>>()
  private closed = false

  /** @param dependencies - account service, deadline, and HTTP transport. */
  constructor(dependencies: ModelKeyCacheDependencies) {
    this.account = dependencies.account
    this.timeoutMs = dependencies.timeoutMs
    this.request = dependencies.request ?? fetch
  }

  /**
   * Resolve the gateway API key for the current device session.
   * @returns the API key, or `undefined` while signed out.
   */
  async resolve(): Promise<string | undefined> {
    return (await this.resolveBound())?.key
  }

  /** Capture one credential generation so late errors cannot invalidate a new session or exchange. */
  async resolveBound(): Promise<CachedKey | undefined> {
    if (this.closed) throw new LlmError('QingClaw model-key cache is disposed.', 'ABORTED')
    const session = await this.account.getPlatformSession()
    if (session === null) {
      this.clear()
      return undefined
    }
    const key = sessionKey(session)
    if (this.cached?.sessionKey === key) return this.cached
    if (this.inflight?.sessionKey === key) return await this.inflight.promise

    const operation = this.exchange(session).then(async (apiKey): Promise<CachedKey> => {
      const current = await this.account.getPlatformSession()
      if (this.closed || !current || sessionKey(current) !== key || this.inflight?.promise !== operation) {
        throw new LlmError('QingClaw account changed during the model-key exchange.', 'ABORTED')
      }
      return (this.cached = { sessionKey: key, key: apiKey })
    }).finally(() => {
      this.pending.delete(operation)
      if (this.inflight?.promise === operation) this.inflight = undefined
    })
    this.inflight = { sessionKey: key, promise: operation }
    this.pending.add(operation)
    return await operation
  }

  /** Drop the exact key rejected by the gateway. */
  reject(key: CachedKey): void {
    if (this.cached !== key) return
    this.cached = undefined
  }

  /** Retire a depleted gateway key and notify the signed-in account once per key generation. */
  reconcileQuota(rejected: CachedKey): Promise<void> {
    const existing = this.reconciliations.get(rejected)
    if (existing) return existing
    if (this.closed || this.cached !== rejected) return Promise.resolve()
    this.reject(rejected)
    const refresh = this.refreshUsage(rejected.sessionKey)
    this.reconciliations.set(rejected, refresh)
    return refresh
  }

  private refreshUsage(expectedSession: string): Promise<void> {
    return this.account.getPlatformSession().then(async (session) => {
      if (!this.closed && session && sessionKey(session) === expectedSession) {
        // The profile refresh queries the gateway balance. The next model request obtains its own new key.
        await this.account.refreshUsage(session.token)
      }
    }).catch(() => {
      // Account refresh failures must not mask the original gateway failure.
    })
  }

  /** Clear all cached keys without changing the device session. */
  clear(): void {
    if (this.cached === undefined && this.inflight === undefined) return
    this.cached = undefined
    this.inflight = undefined
  }

  /** Abort exchanges and wait for admitted work before releasing this owner. */
  async dispose(): Promise<void> {
    this.closed = true
    this.cached = undefined
    this.lifetime.abort()
    await Promise.allSettled(this.pending)
  }

  private async exchange(session: PlatformSession): Promise<string> {
    using limit = deadline(this.lifetime.signal, this.timeoutMs(), TIMEOUT_CODE)
    const headers = new Headers(attributionHeaders())
    for (const [name, value] of Object.entries(session.requestHeaders ?? {})) headers.set(name, value)
    headers.set('accept', 'application/json')
    headers.set('content-type', 'application/json')
    headers.set('x-dsh-auth-token', session.token)
    const url = new URL(KEY_PATH, session.origin).href
    let response: Response
    try {
      response = await this.request(url, { method: 'POST', headers, body: '{}', redirect: 'error', signal: limit.signal })
    } catch (error) {
      throw new LlmError('QingClaw model-key exchange failed.', 'SERVER', { cause: error })
    }
    if (!response.ok) {
      if (response.status === 403) {
        const denial = deniedResponse.safeParse(await readJson(response).catch(() => undefined)).data?.data
        // The website only labels an expired subscription a quota refusal when its remaining balance is zero.
        if (denial?.reason === 'no_quota' || denial?.reason === 'free_quota_exhausted'
            || (denial?.reason === 'subscription_expired' && denial.remaining_tokens === 0)) {
          await this.refreshUsage(sessionKey(session))
          throw new LlmError(denial.message ?? '网关返回额度不足，请刷新用量。', 'ACCOUNT_QUOTA', { status: 403 })
        }
        throw endpointFailure(403, denial?.message)
      }
      throw endpointFailure(response.status)
    }
    const parsed = responseEnvelope.safeParse(await readJson(response))
    if (!parsed.success) throw invalidResponse('has an unexpected envelope', parsed.error)
    return parsed.data.data.biz_data.api_key
  }
}
