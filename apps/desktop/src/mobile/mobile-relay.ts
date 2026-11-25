import WebSocket from 'ws'
import { isMobileResourceId } from './mobile-chat-adapter.ts'
import { MobileHost, type MobileHostOptions } from './mobile-host.ts'

type Frame = Record<string, unknown>
function fields(value: unknown): value is Frame {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export interface RemoteRoom {
  id: string
  desktopToken: string
  pairingSecret: string
  pairingExpiresAt: number
  expiresAt: number
}

export function parseRoom(value: unknown): RemoteRoom {
  if (!fields(value)) throw new Error('Invalid room')
  const { id, desktop_token, pairing_secret, pairing_expires_at, expires_at } = value
  const safeToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{16,512}$/.test(s)
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    !safeToken(desktop_token) ||
    !safeToken(pairing_secret) ||
    typeof pairing_expires_at !== 'string' ||
    typeof expires_at !== 'string'
  )
    throw new Error('Invalid room')
  const pairingExpiresAt = Date.parse(pairing_expires_at),
    expiresAt = Date.parse(expires_at)
  if (!(pairingExpiresAt > Date.now() && expiresAt >= pairingExpiresAt)) throw new Error('Invalid room expiration')
  return { id, desktopToken: desktop_token, pairingSecret: pairing_secret, pairingExpiresAt, expiresAt }
}

interface RelayOptions extends MobileHostOptions {
  platformOrigin: string
  onRevoked(): void
  /** The Platform moved the room's expiry forward while this desktop stayed in use. */
  onExtended?(expiresAt: number): void
}

/** The relay transports only the mobile chat protocol, never an HTTP URL or a Host RPC endpoint. */
export class MobileRelay {
  private socket?: WebSocket | undefined
  private retry?: ReturnType<typeof setTimeout> | undefined
  private heartbeat?: ReturnType<typeof setTimeout> | undefined
  private backoff = 500
  private stopped = false
  private host?: MobileHost | undefined
  private stream?: { sessionId: string; abort: AbortController } | undefined
  private readonly inFlight = new Set<string>()
  private readonly recentResults = new Map<string, Frame>()
  private readonly identifier: string
  ready = false
  private decision: 'approved' | 'denied' | undefined
  get paired(): boolean { return this.decision === 'approved' }
  get denied(): boolean { return this.decision === 'denied' }
  confirmDecision(requestId: string, decision: 'approved' | 'denied'): void {
    if (!this.decision && this.pendingRequestId === requestId) {
      this.pendingRequestId = undefined
      this.decision = decision
    }
  }
  pendingRequestId: string | undefined
  phoneOnline = false
  constructor(
    private readonly options: RelayOptions,
    readonly room: RemoteRoom,
  ) {
    this.identifier = JSON.stringify({ channel: 'MobileRelayChannel', room_id: room.id })
  }
  open(): void {
    if (this.stopped || this.socket) return
    if (this.room.expiresAt <= Date.now()) {
      this.options.onRevoked()
      return
    }
    const target = new URL('/mobile/cable', this.options.platformOrigin)
    target.protocol = 'wss:'
    const socket = new WebSocket(target, 'actioncable-v1-json', {
      origin: this.options.platformOrigin,
      headers: { authorization: 'Bearer ' + this.room.desktopToken },
      handshakeTimeout: 10_000,
      maxPayload: 256 * 1024,
      perMessageDeflate: false,
    })
    this.socket = socket
    const watch = () => {
      clearTimeout(this.heartbeat)
      this.heartbeat = setTimeout(() => {
        socket.terminate()
      }, 25_000)
    }
    socket.on('open', watch)
    socket.on('message', (bytes) => {
      if (this.socket !== socket || this.stopped) return
      let envelope: unknown
      try {
        const text = typeof bytes === 'string' ? bytes : Buffer.isBuffer(bytes) ? bytes.toString('utf8') : undefined
        if (text === undefined) return
        envelope = JSON.parse(text)
      } catch {
        return
      }
      if (!fields(envelope)) return
      watch()
      if (envelope.type === 'welcome') {
        socket.send(JSON.stringify({ command: 'subscribe', identifier: this.identifier }))
      } else if (envelope.type === 'disconnect') {
        if (envelope.reconnect === false) this.options.onRevoked()
        else socket.close()
      } else if (envelope.identifier === this.identifier) {
        if (envelope.type === 'reject_subscription') {
          this.options.onRevoked()
          return
        }
        if (fields(envelope.message)) this.receive(envelope.message)
      }
    })
    socket.on('error', () => {
      /* close schedules bounded reconnect without leaking the token */
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = undefined
      clearTimeout(this.heartbeat)
      this.ready = false
      this.phoneOnline = false
      this.pendingRequestId = undefined
      this.stopHost()
      if (this.stopped) return
      this.retry = setTimeout(() => {
        this.open()
      }, this.backoff)
      this.backoff = Math.min(8000, this.backoff * 2)
    })
  }
  stop(): void {
    this.stopped = true
    clearTimeout(this.retry)
    clearTimeout(this.heartbeat)
    this.stopHost()
    this.socket?.terminate()
    this.socket = undefined
    this.ready = false
    this.decision = undefined
    this.phoneOnline = false
    this.recentResults.clear()
  }
  private stopHost(): void {
    this.stream?.abort.abort()
    this.stream = undefined
    this.host?.stop()
    this.host = undefined
  }
  private receive(message: Frame): void {
    if (message.type === 'revoked') {
      this.options.onRevoked()
      return
    }
    if (message.type === 'offline') {
      this.phoneOnline = false
      // The room survives a browser reload. A new request can open a fresh stream.
      this.stream?.abort.abort()
      this.stream = undefined
      return
    }
    if (message.type === 'pair_requested') {
      if (this.ready && !this.decision && isMobileResourceId(message.request_id)) this.pendingRequestId = message.request_id
      return
    }
    if (message.type === 'state') {
      this.ready = true
      this.backoff = 500
      // A room follows this desktop's use, so its stored credential and local
      // expiry must follow the Platform instead of aging out.
      if (typeof message.expires_at === 'string') {
        const expiresAt = Date.parse(message.expires_at)
        if (Number.isFinite(expiresAt)) this.options.onExtended?.(expiresAt)
      }
      // Each room has a single, irreversible approval decision. Late pub/sub
      // notifications must not expose the consumed invitation again.
      if (!this.decision) {
        if (message.status === 'denied') this.decision = 'denied'
        else if (message.status === 'approved' && message.paired === true) this.decision = 'approved'
      }
      this.pendingRequestId = !this.decision && isMobileResourceId(message.request_id) ? message.request_id : undefined
      this.phoneOnline = this.paired && message.online === true
      if (this.paired) this.host ??= new MobileHost(this.options)
      else this.stopHost()
      return
    }
    if (
      !this.ready ||
      !this.paired ||
      !this.host ||
      message.type !== 'request' ||
      !isMobileResourceId(message.id) ||
      typeof message.method !== 'string' ||
      !fields(message.payload)
    )
      return
    const { id, method, payload } = message
    const previous = this.recentResults.get(id)
    if (previous) {
      this.send(previous)
      return
    }
    if (this.inFlight.has(id)) return
    if (this.inFlight.size >= 32) {
      this.send({ type: 'result', id, ok: false, error: 'Mobile connection is busy.' })
      return
    }
    this.inFlight.add(id)
    const host = this.host
    void this.dispatch(host, method, payload)
      .catch(() => ({ ok: false, error: 'Mobile request failed.' }))
      .then((result) => {
        const frame = { type: 'result', id, ...result }
        this.inFlight.delete(id)
        if (this.stopped || !this.paired) return
        // Keep a bounded deduplication window. Large histories are intentionally not cached.
        if (JSON.stringify(frame).length <= 16_384) {
          if (this.recentResults.size >= 100) {
            const oldest = this.recentResults.keys().next().value
            if (oldest !== undefined) this.recentResults.delete(oldest)
          }
          this.recentResults.set(id, frame)
        }
        if (this.host === host) this.send(frame)
      })
  }
  private async dispatch(host: MobileHost, method: string, payload: Frame): Promise<Frame> {
    if (method !== 'stream.open' && method !== 'stream.close') return host.request(method, payload)
    const { sessionId } = payload
    if (!isMobileResourceId(sessionId) || Object.keys(payload).length !== 1) return { ok: false, error: 'Invalid session.' }
    if (method === 'stream.close') {
      if (this.stream?.sessionId === sessionId) {
        this.stream.abort.abort()
        this.stream = undefined
      }
      return { ok: true }
    }
    this.stream?.abort.abort()
    const abort = new AbortController()
    this.stream = { sessionId, abort }
    void host
      .stream(sessionId, abort.signal, (value) => {
        if (!abort.signal.aborted) this.send({ type: 'event', sessionId, value })
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.stream?.abort === abort) this.stream = undefined
      })
    return { ok: true }
  }
  private send(frame: Frame): void {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return
    const payload = JSON.stringify({
      command: 'message',
      identifier: this.identifier,
      data: JSON.stringify({ action: 'relay', frame }),
    })
    if (Buffer.byteLength(payload) > 1024 * 1024) {
      if (frame.type === 'result')
        this.send({ type: 'result', id: frame.id, ok: false, error: 'Mobile response is too large.' })
      return
    }
    if (this.socket.bufferedAmount > 2 * 1024 * 1024) {
      this.socket.terminate()
      return
    }
    this.socket.send(payload)
  }
}
