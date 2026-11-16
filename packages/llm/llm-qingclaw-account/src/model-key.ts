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

interface CachedKey {
  readonly sessionKey: string
  readonly key: string
}

/** Dependencies of one API-key cache, injectable for tests. */
export interface ModelKeyCacheDependencies {
  readonly account: Pick<DeepSeekAccount, 'getPlatformSession'>
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
  if (status === 403) return new LlmError(detail ?? 'QingClaw account has no active model entitlement.', 'ACCOUNT_QUOTA', { status })
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
  private readonly pending = new Set<Promise<string>>()
  private cached: CachedKey | undefined
  private inflight: { readonly sessionKey: string; readonly promise: Promise<string> } | undefined
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
    if (this.closed) throw new LlmError('QingClaw model-key cache is disposed.', 'ABORTED')
    const session = await this.account.getPlatformSession()
    if (session === null) {
      this.clear()
      return undefined
    }
    const key = sessionKey(session)
    if (this.cached?.sessionKey === key) return this.cached.key
    if (this.inflight?.sessionKey === key) return await this.inflight.promise

    const operation = this.exchange(session).then((apiKey) => {
      this.cached = { sessionKey: key, key: apiKey }
      return apiKey
    }).finally(() => {
      this.pending.delete(operation)
      if (this.inflight?.promise === operation) this.inflight = undefined
    })
    this.inflight = { sessionKey: key, promise: operation }
    this.pending.add(operation)
    return await operation
  }

  /** Drop the exact key rejected by the gateway. */
  reject(key: string): void {
    if (this.cached?.key !== key) return
    this.cached = undefined
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
      const body = await response.json().catch(() => undefined)
      const detail = typeof body === 'object' && body !== null
        ? (Reflect.get(body, 'data') as { message?: unknown } | undefined)?.message
        : undefined
      throw endpointFailure(response.status, typeof detail === 'string' ? detail : undefined)
    }
    const parsed = responseEnvelope.safeParse(await readJson(response))
    if (!parsed.success) throw invalidResponse('has an unexpected envelope', parsed.error)
    return parsed.data.data.biz_data.api_key
  }
}
