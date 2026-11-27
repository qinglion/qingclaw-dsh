import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import QRCode from 'qrcode'
import { desktopPairingPage } from './desktop-pairing-page.ts'
import type { MobileHostOptions } from './mobile-host.ts'
import type { PairingVault } from './pairing-store.ts'
import { MobileRelay, parseRoom, type RemoteRoom } from './mobile-relay.ts'

export interface RemoteMobileBridgeOptions extends MobileHostOptions {
  platformOrigin: string
  desktopTheme: string
  createRoom(signal: AbortSignal): Promise<unknown>
  locale?: 'en' | 'zh' | (() => 'en' | 'zh')
  /** Keeps the room credential across restarts so a phone that already paired keeps its link. */
  pairing?: PairingVault
}
export interface RemoteMobileBridgeSnapshot {
  running: boolean
  paired: boolean
  denied: boolean
  port?: number
}
/** A stop either revokes the phone (default) or only detaches this process from a room it keeps. */
export interface RemoteMobileBridgeStopOptions {
  preserveRoom?: boolean
}

function token(): string {
  return randomBytes(32).toString('base64url')
}
function matches(value: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !value) return false
  const a = Buffer.from(value),
    b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class RemoteMobileBridge {
  private server: Server | undefined
  private localOrigin: string | undefined
  private bootstrap: string | undefined
  private cookie: string | undefined
  private relay: MobileRelay | undefined
  private phase = 'disconnected'
  private qr = ''
  private link = ''
  private expiry: ReturnType<typeof setTimeout> | undefined
  private connecting: Promise<void> | undefined
  private refreshing = false
  /** Bumped whenever a room is detached, so a late subscription never outlives its window of use. */
  private epoch = 0
  private readonly issuer: string
  constructor(private readonly options: RemoteMobileBridgeOptions) {
    const url = new URL(options.platformOrigin)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid QingClaw website origin')
    this.issuer = url.origin
  }
  snapshot(): RemoteMobileBridgeSnapshot {
    const address = this.server?.address() as AddressInfo | null | undefined
    return {
      running: !!address,
      paired: this.relay?.paired ?? false,
      denied: this.relay?.denied ?? false,
      ...(address ? { port: address.port } : {}),
    }
  }
  async start(): Promise<RemoteMobileBridgeSnapshot> {
    if (this.server) {
      void this.ensureRoom()
      return this.snapshot()
    }
    const server = createServer((req, res) => {
      try {
        this.handle(req, res)
      } catch {
        if (!res.headersSent) res.writeHead(400)
        res.end()
      }
    })
    this.server = server
    this.cookie = token()
    try {
      const ready = once(server, 'listening')
      server.listen(0, '127.0.0.1')
      await ready
      if (this.server === server) {
        this.localOrigin = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port)
        void this.ensureRoom()
      }
      return this.snapshot()
    } catch (error) {
      // The loopback page failed to bind; that is no reason to revoke a phone
      // that is already using this desktop.
      await this.stop({ preserveRoom: true })
      throw error
    }
  }
  /**
   * Reattach the persisted room without opening the management page.
   *
   * Runs when the desktop signs in, so a phone that paired earlier reaches this desktop as soon
   * as the application is online instead of waiting for someone to open the window.
   */
  async restore(): Promise<void> {
    await this.ensureRoom()
  }
  createDesktopUrl(): string | undefined {
    if (!this.localOrigin) return undefined
    this.bootstrap = token()
    return this.localOrigin + '/desktop?k=' + this.bootstrap
  }
  /**
   * @param options - `preserveRoom` detaches without revoking the phone or forgetting the room.
   */
  async stop(options?: RemoteMobileBridgeStopOptions): Promise<void> {
    const server = this.server
    this.server = undefined
    this.localOrigin = undefined
    this.cookie = undefined
    this.bootstrap = undefined
    const relay = this.detach()
    const preserve = options?.preserveRoom === true
    const cleanup = (async () => {
      if (preserve) return
      await this.options.pairing?.clear().catch(() => undefined)
      if (relay) await this.release(relay.room)
    })()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>(resolve =>
        server.close(() => {
          resolve()
        }),
      )
    }
    await cleanup
  }
  private async release(room: RemoteRoom): Promise<void> {
    try {
      await fetch(new URL('/auth-api/v0/dsh/mobile/rooms/' + room.id, this.issuer), {
        method: 'DELETE',
        headers: { authorization: 'Bearer ' + room.desktopToken },
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      })
    } catch {
      /* Local access is already revoked. The server also expires rooms. */
    }
  }
  private async decide(action: 'approve' | 'deny', requestId: string): Promise<number> {
    const relay = this.relay
    if (!relay?.ready || relay.paired || !requestId || relay.pendingRequestId !== requestId ||
      relay.room.pairingExpiresAt <= Date.now()) return 409
    try {
      const response = await fetch(new URL('/auth-api/v0/dsh/mobile/rooms/' + relay.room.id + '/' + action, this.issuer), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + relay.room.desktopToken, 'content-type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      })
      await response.body?.cancel()
      if (!response.ok) return response.status === 409 || response.status === 410 ? 409 : 502
      relay.confirmDecision(requestId, action === 'approve' ? 'approved' : 'denied')
      return 204
    } catch {
      return 502
    }
  }
  /** Drops the live relay without touching the server or the stored credential. */
  private detach(): MobileRelay | undefined {
    this.epoch++
    clearTimeout(this.expiry)
    this.expiry = undefined
    const relay = this.relay
    this.relay = undefined
    relay?.stop()
    this.phase = 'disconnected'
    this.qr = ''
    this.link = ''
    return relay
  }
  /** Revokes the pairing: the phone loses access and the stored credential is forgotten. */
  private async disconnect(): Promise<void> {
    const relay = this.detach()
    await this.options.pairing?.clear().catch(() => undefined)
    if (relay) await this.release(relay.room)
  }
  /** The server rejected the room; there is nothing left to revoke, only a credential to forget. */
  private async revoke(): Promise<void> {
    this.detach()
    await this.options.pairing?.clear().catch(() => undefined)
  }
  /** Replaces the room, which also replaces the link a phone scans. */
  private async refresh(): Promise<void> {
    // The status page asks for a replacement every second once an unpaired code
    // expires; one replacement at a time leaves exactly one live link.
    if (this.refreshing) return
    this.refreshing = true
    try {
      const relay = this.detach()
      await this.options.pairing?.clear().catch(() => undefined)
      if (relay) await this.release(relay.room)
      await this.create()
    } finally {
      this.refreshing = false
    }
  }
  private ensureRoom(): Promise<void> {
    this.connecting ??= this.attach()
      .catch(() => undefined)
      .finally(() => {
        this.connecting = undefined
      })
    return this.connecting
  }
  private async attach(): Promise<void> {
    if (this.relay) return
    if (this.phase === 'disconnected') this.phase = 'loading'
    if (await this.restoreStored()) return
    // Without a management page nobody is waiting for a code; a room created here
    // would only be an unreachable invitation.
    if (this.server) await this.create()
  }
  private async restoreStored(): Promise<boolean> {
    const vault = this.options.pairing
    if (!vault) return false
    const room = await vault.load().catch((error: unknown) => {
      // An unreadable record degrades to a fresh pairing instead of a stuck window.
      console.error('desktop: could not read the phone pairing record', error)
      return undefined
    })
    if (!room) return false
    if (room.expiresAt <= Date.now()) {
      await vault.clear().catch(() => undefined)
      return false
    }
    return this.install(room)
  }
  private async create(): Promise<void> {
    const epoch = this.epoch
    this.phase = 'loading'
    let issued: RemoteRoom | undefined
    try {
      issued = parseRoom(await this.options.createRoom(AbortSignal.timeout(12_000)))
      if (epoch !== this.epoch) {
        await this.release(issued)
        return
      }
      const vault = this.options.pairing
      if (vault) {
        // A failed write keeps this session's pairing; only resumption after a
        // restart is lost, which the phone's next scan repairs.
        await vault.save(issued).catch((error: unknown) => {
          console.error('desktop: could not store the phone pairing', error)
        })
      }
      const room = issued
      issued = undefined
      await this.install(room)
    } catch (error) {
      if (epoch !== this.epoch) return
      const reason = error instanceof Error ? error.message : ''
      this.phase = reason === 'Service unavailable' ? 'unavailable' : reason === 'Sign in required' ? 'signin' : 'failed'
      if (issued) await this.release(issued)
    }
  }
  private async install(room: RemoteRoom): Promise<boolean> {
    const epoch = this.epoch
    const pairing = new URL('/mobile', this.issuer)
    pairing.hash = room.id + '.' + room.pairingSecret
    const qr = await QRCode.toDataURL(pairing.href, { width: 256, margin: 2 })
    if (epoch !== this.epoch) return false
    this.link = pairing.href
    this.qr = qr
    const relay: MobileRelay = new MobileRelay(
      {
        platformOrigin: this.issuer,
        harnessCookie: () => this.options.harnessCookie(),
        harnessUrl: () => this.options.harnessUrl(),
        onRevoked: () => {
          if (this.relay === relay) void this.revoke()
        },
        onExtended: (expiresAt) => {
          if (this.relay !== relay || expiresAt <= room.expiresAt) return
          room.expiresAt = expiresAt
          this.scheduleExpiry(room, relay)
          void this.options.pairing?.save(room).catch((error: unknown) => {
            console.error('desktop: could not store the phone pairing', error)
          })
        },
      },
      room,
    )
    this.relay = relay
    this.scheduleExpiry(room, relay)
    this.phase = 'waiting'
    relay.open()
    return true
  }
  /**
   * Ends the pairing when the Platform room expires.
   *
   * A room may live for the whole desktop session, which exceeds the single
   * timer a Node setTimeout accepts; each slice rechecks before it acts.
   */
  private scheduleExpiry(room: RemoteRoom, relay: MobileRelay): void {
    clearTimeout(this.expiry)
    const remaining = Math.max(0, room.expiresAt - Date.now())
    this.expiry = setTimeout(() => {
      if (this.relay !== relay) return
      if (Date.now() < room.expiresAt) {
        this.scheduleExpiry(room, relay)
        return
      }
      void this.disconnect()
    }, Math.min(2_147_483_647, remaining))
  }
  private handle(req: IncomingMessage, res: ServerResponse): void {
    const origin = this.localOrigin
    res.setHeader('cache-control', 'no-store')
    res.setHeader('referrer-policy', 'no-referrer')
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    )
    const deny = (status: number) => {
      res.writeHead(status)
      res.end()
    }
    if (!origin || req.headers.host !== origin.slice(7) || req.socket.remoteAddress !== '127.0.0.1') {
      deny(403)
      return
    }
    const url = new URL(req.url ?? '/', origin)
    if (url.origin !== origin) {
      deny(403)
      return
    }
    if (req.method === 'GET' && url.pathname === '/desktop' && url.searchParams.has('k')) {
      if (!this.cookie || !matches(url.searchParams.get('k'), this.bootstrap)) {
        deny(403)
        return
      }
      this.bootstrap = undefined
      res.writeHead(303, {
        location: '/desktop',
        'set-cookie': 'qingclaw_pairing=' + this.cookie + '; HttpOnly; SameSite=Strict; Path=/desktop',
      })
      res.end()
      return
    }
    const provided = /(?:^|;\s*)qingclaw_pairing=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
    if (
      !matches(provided, this.cookie) ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      deny(403)
      return
    }
    if (req.method === 'GET' && url.pathname === '/desktop') {
      const lang = this.options.locale
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(desktopPairingPage(typeof lang === 'function' ? lang() : (lang ?? 'en'), this.options.desktopTheme))
    } else if (req.method === 'GET' && url.pathname === '/desktop/status') {
      const room = this.relay?.room
      if (room && this.relay?.ready && !this.relay.denied && !this.relay.paired && room.pairingExpiresAt <= Date.now()) void this.refresh()
      const relay = this.relay
      const showCode = relay?.ready && !relay.paired && relay.room.pairingExpiresAt > Date.now()
      let phase = this.phase
      if (relay) {
        if (relay.denied) phase = 'denied'
        else if (!relay.ready) phase = 'reconnecting'
        else if (!relay.paired) phase = relay.pendingRequestId ? 'requested' : 'waiting'
        else phase = relay.phoneOnline ? 'connected' : 'away'
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          phase,
          paired: relay?.paired ?? false,
          ...(phase === 'requested' ? { requestId: relay?.pendingRequestId } : {}),
          ...(showCode && phase === 'waiting'
            ? { qr: this.qr, link: this.link, pairingExpiresAt: relay.room.pairingExpiresAt }
            : {}),
        }),
      )
    } else if (req.method === 'POST' && (url.pathname === '/desktop/approve' || url.pathname === '/desktop/deny')) {
      const requestId = req.headers['x-qingclaw-request-id']
      if (req.headers.origin !== origin || typeof requestId !== 'string') {
        deny(403)
        return
      }
      void this.decide(url.pathname === '/desktop/approve' ? 'approve' : 'deny', requestId).then(deny)
    } else if (req.method === 'POST' && url.pathname === '/desktop/refresh') {
      void this.refresh()
      deny(202)
    } else if (req.method === 'POST' && url.pathname === '/desktop/disconnect') {
      void this.disconnect()
      deny(204)
    } else deny(404)
  }
}
