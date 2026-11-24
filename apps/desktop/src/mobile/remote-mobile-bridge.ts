import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import QRCode from 'qrcode'
import { desktopPairingPage } from './desktop-pairing-page.ts'
import type { MobileHostOptions } from './mobile-host.ts'
import { MobileRelay, parseRoom, type RemoteRoom } from './mobile-relay.ts'

export interface RemoteMobileBridgeOptions extends MobileHostOptions {
  platformOrigin: string
  desktopTheme: string
  createRoom(signal: AbortSignal): Promise<unknown>
  locale?: 'en' | 'zh' | (() => 'en' | 'zh')
}
export interface RemoteMobileBridgeSnapshot {
  running: boolean
  paired: boolean
  denied: boolean
  port?: number
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
  private attempt: AbortController | undefined
  private relay: MobileRelay | undefined
  private phase = 'disconnected'
  private qr = ''
  private link = ''
  private expiry: ReturnType<typeof setTimeout> | undefined
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
    if (this.server) return this.snapshot()
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
        void this.refresh()
      }
      return this.snapshot()
    } catch (error) {
      await this.stop()
      throw error
    }
  }
  createDesktopUrl(): string | undefined {
    if (!this.localOrigin) return undefined
    this.bootstrap = token()
    return this.localOrigin + '/desktop?k=' + this.bootstrap
  }
  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.localOrigin = undefined
    this.cookie = undefined
    this.bootstrap = undefined
    const cleanup = this.disconnect()
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
  private disconnect(): Promise<void> {
    this.attempt?.abort()
    this.attempt = undefined
    clearTimeout(this.expiry)
    const relay = this.relay
    this.relay = undefined
    relay?.stop()
    this.phase = 'disconnected'
    this.qr = ''
    this.link = ''
    return relay ? this.release(relay.room) : Promise.resolve()
  }
  private async refresh(): Promise<void> {
    if (this.attempt || !this.server) return
    const previous = this.disconnect()
    const attempt = new AbortController()
    this.attempt = attempt
    this.phase = 'loading'
    let issued: RemoteRoom | undefined
    try {
      await previous
      attempt.signal.throwIfAborted()
      issued = parseRoom(await this.options.createRoom(AbortSignal.any([attempt.signal, AbortSignal.timeout(12_000)])))
      const pairing = new URL('/mobile', this.issuer)
      pairing.hash = issued.id + '.' + issued.pairingSecret
      const qr = await QRCode.toDataURL(pairing.href, { width: 256, margin: 2 })
      attempt.signal.throwIfAborted()
      this.link = pairing.href
      this.qr = qr
      const relay: MobileRelay = new MobileRelay(
        {
          platformOrigin: this.issuer,
          harnessCookie: () => this.options.harnessCookie(),
          harnessUrl: () => this.options.harnessUrl(),
          onRevoked: () => {
            if (this.relay === relay) void this.disconnect()
          },
        },
        issued,
      )
      this.relay = relay
      this.expiry = setTimeout(
        () => {
          if (this.relay === relay) void this.disconnect()
        },
        Math.min(2_147_483_647, issued.expiresAt - Date.now()),
      )
      issued = undefined
      this.phase = 'waiting'
      relay.open()
    } catch (error) {
      if (!attempt.signal.aborted) {
        const reason = error instanceof Error ? error.message : ''
        this.phase = reason === 'Service unavailable' ? 'unavailable' : reason === 'Sign in required' ? 'signin' : 'failed'
      }
    } finally {
      if (this.attempt === attempt) this.attempt = undefined
      if (issued) await this.release(issued)
    }
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
