import { afterEach, expect, it, vi } from 'vitest'
import { RemoteMobileBridge } from '../src/mobile/remote-mobile-bridge.ts'
import { parseRoom } from '../src/mobile/mobile-relay.ts'

const cables = vi.hoisted(
  () =>
    [] as Array<{
      send: ReturnType<typeof vi.fn>
      terminate: ReturnType<typeof vi.fn>
      emit(event: string, ...args: unknown[]): boolean
      url: URL
      protocol: string
      options: { origin: string; headers: { authorization: string } }
    }>,
)
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  class Cable extends EventEmitter {
    static OPEN = 1
    readyState = 1
    bufferedAmount = 0
    send = vi.fn()
    terminate = vi.fn(() => {
      this.emit('close')
    })
    constructor(
      readonly url: URL,
      readonly protocol: string,
      readonly options: (typeof cables)[number]['options'],
    ) {
      super()
      cables.push(this)
    }
  }
  return { default: Cable }
})
afterEach(() => {
  vi.unstubAllGlobals()
  cables.length = 0
})

function room(id = 'room-1') {
  return {
    id,
    pairing_secret: 's'.repeat(32),
    desktop_token: 'd'.repeat(32),
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    pairing_expires_at: new Date(Date.now() + 300_000).toISOString(),
  }
}
const origin = 'https://site.example'
function fixture(createRoom = vi.fn(async () => room())) {
  return new RemoteMobileBridge({
    platformOrigin: origin,
    createRoom,
    locale: 'zh',
    harnessUrl: () => undefined,
    harnessCookie: () => undefined,
  })
}
async function pairingClient(bridge: RemoteMobileBridge) {
  await bridge.start()
  const bootstrap = new URL(bridge.createDesktopUrl()!)
  const response = await fetch(bootstrap, { redirect: 'manual' })
  expect(response.status).toBe(303)
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!
  return (path: string, method = 'GET', headers: Record<string, string> = {}) => fetch(new URL(path, bootstrap), {
    method, headers: { cookie, origin: bootstrap.origin, ...headers },
  })
}

it('creates a remote-only code, serves management exclusively on loopback, and disconnects a paired phone', async () => {
  const release = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url: URL, init: RequestInit) =>
    new URL(url).origin === origin ? release(url, init) : realFetch(url, init),
  )
  const bridge = fixture()
  try {
    const client = await pairingClient(bridge)
    await vi.waitFor(() => {
      expect(cables.length).toBe(1)
    })
    const socket = cables[0]!
    expect(socket.url.href).toBe('wss://site.example/mobile/cable')
    expect(socket.options.origin).toBe(origin)
    expect(socket.options.headers.authorization).toBe('Bearer ' + room().desktop_token)
    socket.emit('message', JSON.stringify({ type: 'welcome' }))
    const identifier = JSON.stringify({ channel: 'MobileRelayChannel', room_id: 'room-1' })
    expect(JSON.parse(socket.send.mock.calls[0]![0] as string)).toEqual({ command: 'subscribe', identifier })
    const receive = (message: object) => socket.emit('message', JSON.stringify({ identifier, message }))
    receive({ type: 'state', paired: false })
    const pending = (await (await client('/desktop/status')).json()) as Record<string, unknown>
    expect(pending.link).toBe(origin + '/mobile#room-1.' + room().pairing_secret)
    expect(pending.qr).toMatch(/^data:image\/png;base64,/)
    expect(pending).not.toHaveProperty('pin')
    expect(pending).not.toHaveProperty('desktop_token')
    expect((await client('/api/rpc', 'POST')).status).toBe(404)
    const html = await (await client('/desktop')).text()
    expect(html).toContain('青狮官网')
    expect(html).not.toMatch(/cloudflare|pinggy|wi-fi/i)
    const command = { type: 'request', id: 'r1', method: 'workspace.unlisted', payload: {} }
    receive(command)
    expect(socket.send).toHaveBeenCalledTimes(1)
    receive({ type: 'paired' })
    receive(command)
    expect(socket.send).toHaveBeenCalledTimes(1)
    receive({ type: 'state', status: 'approved', paired: true })
    receive(command)
    await vi.waitFor(() => {
      expect(socket.send).toHaveBeenCalledTimes(2)
    })
    const packet = JSON.parse(socket.send.mock.calls[1]![0] as string) as { data: string }
    expect(JSON.parse(packet.data)).toMatchObject({ action: 'relay', frame: { id: 'r1', type: 'result', ok: false } })
    const status = async (): Promise<unknown> => (await client('/desktop/status')).json()
    expect(await status()).toEqual({ phase: 'away', paired: true })
    receive({ type: 'state', status: 'approved', paired: true, online: true })
    expect(await status()).toEqual({ phase: 'connected', paired: true })
    receive({ type: 'offline' })
    expect(await status()).toEqual({ phase: 'away', paired: true })
    expect(bridge.snapshot().paired).toBe(true)
    expect(release).not.toHaveBeenCalled()
    receive({ type: 'state', status: 'approved', paired: true, online: true })
    expect(await status()).toEqual({ phase: 'connected', paired: true })
    expect((await client('/desktop/disconnect', 'POST')).status).toBe(204)
    expect(bridge.snapshot().paired).toBe(false)
    expect(socket.terminate).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  } finally {
    await bridge.stop()
  }
})

it('sends only explicit decisions for the current phone request from the management window', async () => {
  const decision = vi.fn(async (_url: URL, _init: RequestInit) => new Response(null, { status: 204 }))
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url: URL, init: RequestInit) =>
    new URL(url).origin === origin ? decision(url, init) : realFetch(url, init),
  )
  const bridge = fixture()
  try {
    const client = await pairingClient(bridge)
    await vi.waitFor(() => { expect(cables).toHaveLength(1) })
    const identifier = JSON.stringify({ channel: 'MobileRelayChannel', room_id: 'room-1' })
    const receive = (message: object) => cables[0]!.emit('message', JSON.stringify({ identifier, message }))
    const request = (action: string, id: string, headers = {}) =>
      client('/desktop/' + action, 'POST', { 'x-qingclaw-request-id': id, ...headers })
    receive({ type: 'state', paired: false, request_id: 'original' })
    receive({ type: 'pair_requested', request_id: 'newer' })
    expect(await (await client('/desktop/status')).json()).toEqual({ phase: 'requested', paired: false, requestId: 'newer' })
    expect((await request('approve', 'newer', { origin: 'https://other.example' })).status).toBe(403)
    expect((await request('approve', 'original')).status).toBe(409)
    expect(decision).not.toHaveBeenCalled()
    expect((await request('deny', 'newer')).status).toBe(204)
    expect((await request('approve', 'newer')).status).toBe(409)
    receive({ type: 'state', paired: false, status: 'denied' })
    receive({ type: 'state', paired: false, status: 'pending', request_id: 'stale' })
    expect(await (await client('/desktop/status')).json()).toEqual({ phase: 'denied', paired: false })
    expect(bridge.snapshot().denied).toBe(true)
    expect((await request('approve', 'stale')).status).toBe(409)
    expect((await client('/desktop/refresh', 'POST')).status).toBe(202)
    await vi.waitFor(() => { expect(cables).toHaveLength(2) })
    const receiveNew = (message: object) => cables[1]!.emit('message', JSON.stringify({ identifier, message }))
    receiveNew({ type: 'state', paired: false, request_id: 'resubmitted' })
    expect((await request('approve', 'resubmitted')).status).toBe(204)
    expect(decision.mock.calls.filter(([, init]) => init.method === 'POST').map(([url, init]) => [String(url), init.method, init.body, init.headers])).toEqual(
      ([['deny', 'newer'], ['approve', 'resubmitted']] as const).map(([action, id]) => [
        origin + '/auth-api/v0/dsh/mobile/rooms/room-1/' + action, 'POST', JSON.stringify({ request_id: id }),
        { authorization: 'Bearer ' + room().desktop_token, 'content-type': 'application/json' },
      ]),
    )
    receiveNew({ type: 'state', status: 'approved', paired: true, online: true })
    expect(await (await client('/desktop/status')).json()).toEqual({ phase: 'connected', paired: true })
    expect((await request('deny', 'resubmitted')).status).toBe(409)
  } finally {
    await bridge.stop()
  }
})

it('reports the unpublished website API and can retry from the same pairing window', async () => {
  const createRoom = vi.fn(async () => room()).mockRejectedValueOnce(new Error('Service unavailable'))
  const bridge = fixture(createRoom)
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url: URL, init: RequestInit) =>
    new URL(url).origin === origin ? Promise.resolve(new Response()) : realFetch(url, init),
  )
  try {
    const client = await pairingClient(bridge)
    expect(await (await client('/desktop/status')).json()).toMatchObject({ phase: 'unavailable' })
    expect((await client('/desktop/refresh', 'POST')).status).toBe(202)
    await vi.waitFor(() => {
      expect(cables).toHaveLength(1)
    })
    expect(createRoom).toHaveBeenCalledTimes(2)
  } finally {
    await bridge.stop()
  }
})

it('rejects room identifiers and secrets that are not valid local URL components', () => {
  expect(() => parseRoom({ ...room(), id: '../another' })).toThrow()
  expect(() => parseRoom({ ...room(), pairing_secret: '123' })).toThrow()
  expect(() => parseRoom({ ...room(), pairing_expires_at: 'invalid' })).toThrow()
})
