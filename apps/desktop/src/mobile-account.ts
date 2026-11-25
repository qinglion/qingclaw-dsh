import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account/types'
import type { BrowserWindow } from 'electron'
import { QINGCLAW_DESKTOP_DISTRIBUTION } from './distribution.ts'

/** The desktop grant stays at its original website. The bridge receives only the room-scoped response. */
export async function registerMobileRoom(origin: string, account: PlatformSession, signal: AbortSignal,
  request: typeof fetch = fetch): Promise<unknown> {
  const { test, production } = QINGCLAW_DESKTOP_DISTRIBUTION.services.platformOrigins
  if (origin !== account.origin || (origin !== test && origin !== production)) throw new Error('Sign in required')
  const headers = new Headers(account.requestHeaders)
  headers.set('x-dsh-auth-token', account.token)
  headers.set('accept', 'application/json')
  const response = await request(new URL('/auth-api/v0/dsh/mobile/rooms', origin), {
    method: 'POST', headers, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    redirect: 'error', credentials: 'omit', cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel()
    if (response.status === 401 || response.status === 403) throw new Error('Sign in required')
    if ([404, 405, 503].includes(response.status)) throw new Error('Service unavailable')
    throw new Error('Connection failed')
  }
  return response.json()
}

/** One account session's live pairing: the relay serving the phone and its management window. */
export interface DesktopMobilePairing {
  /** Reattaches the stored room so a phone that paired before a restart keeps its link. */
  restore(): Promise<void>
  /**
   * @param parent - window that owns the management page.
   * @param title - localized window title.
   */
  open(parent: BrowserWindow, title: string): Promise<void>
  /**
   * @param options - `preserveRoom` keeps the room and its stored credential for the next start.
   */
  dispose(options?: { preserveRoom?: boolean }): Promise<void>
}

/**
 * Owns the phone pairing of the signed-in account.
 *
 * The pairing outlives a window and an application restart: only signing out, an explicit
 * disconnect, or the room's own expiry revokes it. A replacement session (a refreshed Platform
 * token, a Host restart, or another account) keeps the stored room so the link stays fixed.
 */
export class DesktopMobileAccount {
  private account: PlatformSession | null = null
  private pairing: DesktopMobilePairing | undefined
  private closing: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(private readonly createPairing: (account: PlatformSession) => DesktopMobilePairing) {}

  setSession(next: PlatformSession | null): void {
    const previous = this.account
    this.account = next
    if (previous?.token === next?.token && previous?.origin === next?.origin
      && (!previous?.userId || !next?.userId || previous.userId === next.userId)) return
    const generation = ++this.generation
    const pairing = this.pairing
    const pending = this.closing
    this.pairing = undefined
    this.closing = (async () => {
      await pending
      // Signing out revokes the phone; any other replacement only detaches this process.
      await pairing?.dispose({ preserveRoom: next !== null }).catch(() => undefined)
      if (generation !== this.generation || this.account === null) return
      const created = this.createPairing(this.account)
      this.pairing = created
      await created.restore().catch(() => undefined)
    })()
  }

  async open(parent: BrowserWindow, title: string): Promise<void> {
    const generation = this.generation
    await this.closing
    const pairing = this.pairing
    if (generation !== this.generation || pairing === undefined || this.account === null) {
      throw new Error('Sign in to QingClaw to connect a phone')
    }
    await pairing.open(parent, title)
  }

  /**
   * @param options - `preserveRoom` keeps the pairing alive for the next application start.
   * @returns resolution once the pairing detached.
   */
  close(options?: { preserveRoom?: boolean }): Promise<void> {
    this.generation++
    const pairing = this.pairing
    const previous = this.closing
    this.pairing = undefined
    this.closing = (async () => {
      await previous
      await pairing?.dispose(options).catch(() => undefined)
    })()
    return this.closing
  }
}
