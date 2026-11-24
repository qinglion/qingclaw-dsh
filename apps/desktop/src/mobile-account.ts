import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account/types'
import type { BrowserWindow } from 'electron'
import { QINGCLAW_DESKTOP_DISTRIBUTION } from './distribution.ts'
import type { MobilePairingWindow } from './mobile-pairing-window.ts'

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

type WindowHandle = Pick<MobilePairingWindow, 'open' | 'dispose'>

/** Pairings belong to the private Host session that created them. A login or Host restart gets a fresh bridge. */
export class DesktopMobileAccount {
  private account: PlatformSession | null = null
  private window: WindowHandle | undefined
  private closing: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(private readonly createWindow: (account: PlatformSession) => WindowHandle) {}

  setSession(next: PlatformSession | null): void {
    const previous = this.account
    this.account = next
    if (previous?.token === next?.token && previous?.origin === next?.origin
      && (!previous?.userId || !next?.userId || previous.userId === next.userId)) return
    void this.close()
  }

  async open(parent: BrowserWindow, title: string): Promise<void> {
    const generation = this.generation
    await this.closing
    if (generation !== this.generation || !this.account) throw new Error('Sign in to QingClaw to connect a phone')
    this.window ??= this.createWindow(this.account)
    await this.window.open(parent, title)
  }

  close(): Promise<void> {
    this.generation++
    const previous = this.window
    if (!previous) return this.closing
    this.window = undefined
    this.closing = previous.dispose().catch(() => undefined)
    return this.closing
  }
}
