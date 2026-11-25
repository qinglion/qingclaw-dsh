/**
 * Private-registry reads for the signed-in QingClaw account.
 *
 * The platform issues the same short-lived npm grant it issues for publishing. This module exchanges that grant for
 * a registry bearer token and keeps the token until it expires. The token authorizes packument and tarball reads for
 * the account: it stays in the Host process and never reaches the browser, a log, the profile, or a command line.
 * @module @qinglion/dsh-qingclaw-workbench/registry-auth
 */

import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Where the platform issues the read grant, relative to the origin that issued the account session. */
const GRANT_PATH = '/auth-api/v0/dsh/registry/read-grant'

/** How long before its expiry a cached token is exchanged again, in milliseconds. */
const REFRESH_MARGIN_MS = 60_000

/** Bound on one grant or token exchange, in milliseconds. */
const EXCHANGE_TIMEOUT_MS = 15_000

/** The failure code a signed-out registry read reports, so the browser can ask for a sign-in. */
const SIGN_IN_REQUIRED_CODE = 'qingclaw-workbench/sign-in-required'

/** The failure code a free account gets when it asks for the workbench credential. */
const PRO_REQUIRED_CODE = 'qingclaw-workbench/pro-required'

function signInRequired(): RemoteError {
  return new RemoteError(SIGN_IN_REQUIRED_CODE, 'Sign in to QingClaw to read the private workbench registry.', {})
}

function proRequired(): RemoteError {
  return new RemoteError(PRO_REQUIRED_CODE, 'Reading or installing a workbench requires the professional licence.', {})
}

/** Minimal account reader: the Host-only platform grant that identifies the signed-in account. */
interface AccountSessionReader {
  getPlatformSession(): Promise<{
    readonly origin: string
    readonly token: string
    readonly requestHeaders?: Readonly<Record<string, string>>
  } | null>
}

/** A registry bearer token and the instant it stops being accepted. */
export interface RegistryAuthorization {
  readonly token: string
  readonly expiresAt: number
}

/** An account session as the exchange reads it. */
type AccountSession = NonNullable<Awaited<ReturnType<AccountSessionReader['getPlatformSession']>>>

/**
 * Exchange the signed-in account's platform grant for private-registry read tokens.
 *
 * One instance belongs to the workbench Host service, so its cache lives exactly as long as that service. A cached
 * token is reused only for the account session that produced it: another sign-in or a rotated session token is
 * exchanged again rather than reusing another account's read access.
 */
export class WorkbenchRegistryAccess {
  private readonly cached = new Map<string, RegistryAuthorization>()
  private readonly pending = new Map<string, Promise<RegistryAuthorization>>()

  /** @param ctx - Host context that provides the account service. @param lifetime - Ends every exchange with the owner. */
  constructor(private readonly ctx: Context, private readonly lifetime: AbortSignal) {}

  /**
   * The bearer token that authorizes reads from one registry for the current account.
   * @param registry - the registry URL a catalog entry names.
   * @returns the token and its expiry; a cached one while it stays valid.
   */
  async authorization(registry: string): Promise<RegistryAuthorization> {
    this.lifetime.throwIfAborted()
    const session = await this.reader()?.getPlatformSession() ?? null
    if (session === null) throw signInRequired()
    const key = [registry, session.origin, session.token].join('\n')
    const cached = this.cached.get(key)
    if (cached !== undefined && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached
    const running = this.pending.get(key)
    if (running !== undefined) return running
    const exchange = this.exchange(new URL(registry), session)
    this.pending.set(key, exchange)
    exchange.then(
      (authorization) => { this.cached.set(key, authorization) },
      () => undefined,
    ).finally(() => { this.pending.delete(key) })
    return exchange
  }

  private reader(): AccountSessionReader | undefined {
    return this.ctx.get('deepseekAccount') as AccountSessionReader | undefined
  }

  private async exchange(registry: URL, session: AccountSession): Promise<RegistryAuthorization> {
    const signal = AbortSignal.any([this.lifetime, AbortSignal.timeout(EXCHANGE_TIMEOUT_MS)])
    const response = await fetch(new URL(GRANT_PATH, session.origin), {
      method: 'POST', redirect: 'error', signal,
      headers: { ...session.requestHeaders, 'X-DSH-Auth-Token': session.token, accept: 'application/json' },
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw signInRequired()
      // The platform withholds the credential from a free account, so the browser
      // asks for the professional plan instead of retrying.
      if (response.status === 402) throw proRequired()
      throw new Error('无法获取青狮 npm 读取授权，请稍后重试。')
    }
    const grant = await response.json() as {
      username?: unknown
      password?: unknown
      registry?: unknown
      expires_at?: unknown
    }
    const expiresAt = typeof grant.expires_at === 'string' ? Date.parse(grant.expires_at) : Number.NaN
    if (typeof grant.username !== 'string' || !/^qc-[1-9]\d*$/.test(grant.username)
      || typeof grant.password !== 'string' || !/^qcn_[A-Za-z0-9_-]{43}$/.test(grant.password)
      || typeof grant.registry !== 'string' || grant.registry.replace(/\/+$/, '') !== registry.href.replace(/\/+$/, '')
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('青狮 npm 读取授权无效或已到期。')
    }
    const login = await fetch(new URL('-/user/org.couchdb.user:' + grant.username, registry), {
      method: 'PUT', redirect: 'error', signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: grant.username, password: grant.password, type: 'user', roles: [] }),
    })
    if (!login.ok) throw new Error('青狮 npm 暂未接受本次读取授权，请稍后重试。')
    const answer = await login.json() as { token?: unknown }
    if (typeof answer.token !== 'string' || !answer.token || answer.token.length > 16384 || /\s/.test(answer.token)) {
      throw new Error('青狮 npm 返回的令牌无效。')
    }
    return { token: answer.token, expiresAt }
  }
}
