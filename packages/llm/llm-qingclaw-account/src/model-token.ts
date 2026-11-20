/** Short-lived QingClaw model JWT exchange, validation, caching, and invalidation. */
import { Buffer } from 'node:buffer'
import type { DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { z } from 'zod'

const TOKEN_PATH = '/auth-api/v0/dsh/model_token'
const TOKEN_LIFETIME_SECONDS = 900
const TOKEN_REFRESH_MARGIN_MS = 60_000
const TOKEN_RESPONSE_LIMIT_BYTES = 65_536
const TOKEN_TIMEOUT_CODE = 'QINGCLAW_MODEL_TOKEN_TIMEOUT'

const responseEnvelope = z.object({
  code: z.literal(0),
  data: z.object({
    biz_code: z.literal(0),
    biz_data: z.object({
      token: z.string().min(1).max(16_384),
      token_type: z.literal('Bearer'),
      expires_in: z.literal(TOKEN_LIFETIME_SECONDS),
      expires_at: z.number().int().positive(),
    }),
  }),
})
const jwtClaims = z.object({ exp: z.number().int().positive() })

interface ModelGrant {
  readonly token: string
  readonly usableUntil: number
}

interface CachedGrant extends ModelGrant {
  readonly sessionKey: string
}

/** Dependencies of one cache instance, injectable for deterministic transport and clock tests. */
export interface ModelTokenCacheDependencies {
  /** Long-lived QingClaw device session owner. */
  readonly account: Pick<DeepSeekAccount, 'getPlatformSession' | 'rejectToken'>
  /** Deadline of one Platform token exchange. */
  readonly timeoutMs: () => number
  /** Wall clock used for JWT expiry; defaults to `Date.now`. */
  readonly now?: () => number
  /** HTTP implementation used for Platform exchange; defaults to global `fetch`. */
  readonly request?: typeof fetch
}

function sessionKey(session: PlatformSession): string {
  return `${session.origin}\n${session.token}`
}

function invalidResponse(message: string, cause?: unknown): LlmError {
  return new LlmError(`QingClaw model-token response ${message}`, 'INVALID_RESPONSE', cause === undefined ? undefined : { cause })
}

function expirationOf(token: string): number {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[1] === undefined || parts[1].length === 0) throw invalidResponse('contains an invalid JWT')
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch (error) {
    throw invalidResponse('contains an unreadable JWT payload', error)
  }
  const claims = jwtClaims.safeParse(decoded)
  if (!claims.success) throw invalidResponse('contains no valid JWT exp claim', claims.error)
  return claims.data.exp
}

async function readJson(response: Response): Promise<unknown> {
  if (response.body === null) throw invalidResponse('has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > TOKEN_RESPONSE_LIMIT_BYTES) throw invalidResponse('exceeds the body limit')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value
  } catch (error) {
    throw invalidResponse('is not JSON', error)
  }
}

function endpointFailure(status: number): LlmError {
  if (status === 403) return new LlmError('QingClaw account has no active model entitlement.', 'ACCOUNT_QUOTA', { status })
  if (status === 429) return new LlmError('QingClaw model-token exchange was rate limited.', 'RATE_LIMIT', { status })
  if (status >= 500) return new LlmError('QingClaw model-token service is unavailable.', 'SERVER', { status })
  return new LlmError(`QingClaw model-token endpoint answered HTTP ${status}.`, `HTTP_${status}`, { status })
}

/** In-memory short-token owner. It never persists a model JWT or exposes the device token to the gateway. */
export class ModelTokenCache {
  private readonly account: ModelTokenCacheDependencies['account']
  private readonly timeoutMs: () => number
  private readonly now: () => number
  private readonly request: typeof fetch
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<ModelGrant>>()
  private cached: CachedGrant | undefined
  private inflight: { readonly sessionKey: string; readonly promise: Promise<ModelGrant> } | undefined
  private generation = 0
  private closed = false

  /** @param dependencies - account service, deadline, clock, and HTTP transport. */
  constructor(dependencies: ModelTokenCacheDependencies) {
    this.account = dependencies.account
    this.timeoutMs = dependencies.timeoutMs
    this.now = dependencies.now ?? (() => Date.now())
    this.request = dependencies.request ?? fetch
  }

  /**
   * Resolve a usable model JWT for the current long-lived device session.
   * Concurrent misses for one session share one exchange; the cache stops using a token 60 seconds before `exp`.
   * @returns a short-lived JWT, or `undefined` while signed out.
   */
  async resolve(): Promise<string | undefined> {
    if (this.closed) throw new LlmError('QingClaw model-token cache is disposed.', 'ABORTED')
    const session = await this.account.getPlatformSession()
    if (session === null) {
      this.clear()
      return undefined
    }
    const key = sessionKey(session)
    if (this.cached?.sessionKey === key && this.now() < this.cached.usableUntil) return this.cached.token
    if (this.inflight?.sessionKey === key) return (await this.inflight.promise).token

    const generation = this.generation
    const operation: Promise<ModelGrant> = this.exchange(session, key).then((grant) => {
      if (this.generation !== generation || this.inflight?.promise !== operation) {
        throw new LlmError('QingClaw model-token exchange was invalidated.', 'ABORTED')
      }
      this.cached = { ...grant, sessionKey: key }
      return grant
    }).finally(() => {
      this.pending.delete(operation)
      if (this.inflight?.promise === operation) this.inflight = undefined
    })
    this.inflight = { sessionKey: key, promise: operation }
    this.pending.add(operation)
    return (await operation).token
  }

  /** Clear only the exact short JWT rejected by the gateway. */
  reject(token: string): void {
    if (this.cached?.token !== token) return
    this.cached = undefined
    this.generation += 1
  }

  /** Clear all short-token state without changing the long-lived device session. */
  clear(): void {
    if (this.cached === undefined && this.inflight === undefined) return
    this.cached = undefined
    this.inflight = undefined
    this.generation += 1
  }

  /** Abort exchanges and wait for admitted work before releasing this owner. */
  async dispose(): Promise<void> {
    this.closed = true
    this.generation += 1
    this.cached = undefined
    this.lifetime.abort()
    await Promise.allSettled(this.pending)
  }

  private invalidateSession(key: string): void {
    if (this.cached?.sessionKey !== key && this.inflight?.sessionKey !== key) return
    if (this.cached?.sessionKey === key) this.cached = undefined
    if (this.inflight?.sessionKey === key) this.inflight = undefined
    this.generation += 1
  }

  private async exchange(session: PlatformSession, key: string): Promise<ModelGrant> {
    using limit = deadline(this.lifetime.signal, this.timeoutMs(), TOKEN_TIMEOUT_CODE)
    const headers = new Headers(attributionHeaders())
    for (const [name, value] of Object.entries(session.requestHeaders ?? {})) headers.set(name, value)
    headers.set('accept', 'application/json')
    headers.set('content-type', 'application/json')
    headers.set('x-dsh-auth-token', session.token)
    const url = new URL(TOKEN_PATH, session.origin).href
    let response: Response
    try {
      response = await this.request(url, {
        method: 'POST', headers, body: '{}', redirect: 'error', signal: limit.signal,
      })
    } catch (error) {
      const expired = timeoutOf(limit.signal, TOKEN_TIMEOUT_CODE)
      if (expired !== undefined) {
        throw new LlmError(`QingClaw model-token exchange timed out after ${expired.timeoutMs} ms.`, 'TIMEOUT', { cause: error })
      }
      if (limit.signal.aborted) throw new LlmError('QingClaw model-token exchange was aborted.', 'ABORTED', { cause: error })
      throw new LlmError('Could not reach the QingClaw model-token service.', 'TRANSPORT', { cause: error })
    }
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined)
      this.invalidateSession(key)
      try {
        await this.account.rejectToken(session.token)
      } catch (_deviceSessionRemovalFailed) {
        // The authentication failure remains authoritative; a matching later account read can retry removal.
      }
      throw new LlmError('Sign in to QingClaw again to use the account provider.', 'ACCOUNT_SIGN_IN_REQUIRED', { status: 401 })
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw endpointFailure(response.status)
    }
    let body: unknown
    try {
      body = await readJson(response)
    } catch (error) {
      const expired = timeoutOf(limit.signal, TOKEN_TIMEOUT_CODE)
      if (expired !== undefined) {
        throw new LlmError(`QingClaw model-token exchange timed out after ${expired.timeoutMs} ms.`, 'TIMEOUT', { cause: error })
      }
      if (limit.signal.aborted) throw new LlmError('QingClaw model-token exchange was aborted.', 'ABORTED', { cause: error })
      if (error instanceof LlmError) throw error
      throw invalidResponse('could not be read', error)
    }
    const parsed = responseEnvelope.safeParse(body)
    if (!parsed.success) throw invalidResponse('does not match the success protocol', parsed.error)
    const grant = parsed.data.data.biz_data
    const exp = expirationOf(grant.token)
    if (grant.expires_at !== exp) throw invalidResponse('disagrees with its JWT exp claim')
    const usableUntil = exp * 1_000 - TOKEN_REFRESH_MARGIN_MS
    if (usableUntil <= this.now()) throw invalidResponse('expires within the refresh margin')
    return { token: grant.token, usableUntil }
  }
}
