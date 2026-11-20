import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { ConnectionAuthentication, HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { bridge } from '@deepseek-ai/dsh-client-connection/src/http-bridge.ts'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { marketRequest } from '../src/client/api.ts'
import { apply } from '../src/index.ts'
import { CONTROL_PATH } from '../src/types.ts'

const httpFetch = globalThis.fetch
afterEach(() => vi.unstubAllGlobals())

async function serve() {
  const ctx = new Context()
  new ConnectionAuthentication(ctx)
  const connection = new HostConnectionService(ctx, [])
  ctx.provide('deepseekAccount', {
    getPlatformSession: async () => ({ origin: 'https://website.example', token: 'host-token', requestHeaders: {} }),
  } as Context['deepseekAccount'])
  const fiber = ctx.plugin(apply)
  await fiber.await()
  const handler = connection.createSharedFetchHandler('/api')
  const server = createServer((req, res) => {
    void bridge(req, res, handler, connection.browserPeer).catch(() => {
      res.writeHead(400)
      res.end()
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  onTestFinished(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve() })
    })
    await fiber.dispose()
  })
  const base = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port)
  vi.stubGlobal('document', { baseURI: base + '/' })
  const carrier = vi.fn((url: URL, init: RequestInit) => httpFetch(url, init))
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch: carrier })
  return { base, carrier }
}

it('reads, requests and approves a listing through the owner HTTP bridge', async () => {
  const { base, carrier } = await serve()
  const website = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.origin).toBe('https://website.example')
    if (init.method === 'GET') return Response.json({ publications: [] })
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    if (url.pathname.endsWith('/7/list')) return Response.json({ state: 'publishing' }, { status: 202 })
    expect(url.pathname).toBe('/auth-api/v0/dsh/plugin-publications')
    expect(JSON.parse(init.body as string)).toEqual({ package_name: '@qinglion/workbench', version: '2.7.2-beta.1' })
    return Response.json({ state: 'pending' }, { status: 201 })
  })
  vi.stubGlobal('fetch', website)
  const signal = new AbortController().signal
  expect(await marketRequest('publications', signal)).toEqual({ publications: [] })
  expect(await marketRequest('submit', signal, { post: true, params: { package_name: '@qinglion/workbench', version: '2.7.2-beta.1' } }))
    .toEqual({ state: 'pending' })
  expect(await marketRequest('list', signal, { post: true, params: { id: '7' } })).toEqual({ state: 'publishing' })
  for (const [input] of carrier.mock.calls) expect(input.pathname).toBe(CONTROL_PATH)
  const obsoleteUpload = new URL('/api/qingclaw-market/upload?action=submit', base)
  expect((await httpFetch(obsoleteUpload, { method: 'POST' })).status).toBe(404)
  expect(website).toHaveBeenCalledTimes(3)
})
