import { afterEach, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { CONTROL_PATH } from '../src/types.ts'

afterEach(() => vi.unstubAllGlobals())
function route(authenticated = true) {
  const handlers = new Map<string, (request: Request) => Promise<Response>>()
  const origin = 'https://qingclaw.example'
  apply({
    effect: (start: () => unknown) => start(),
    deepseekAccount: { getPlatformSession: async () => authenticated ? { origin, token: 'host-only', requestHeaders: {} } : null },
    connection: { fetch: { register: (options: { path: string; fetch: (request: Request) => Promise<Response> }) => {
      handlers.set(options.path, options.fetch)
    } } },
  } as unknown as Context)
  return (query: string, init?: RequestInit, path = CONTROL_PATH) => handlers.get(path)!(new Request('http://localhost' + path + '?' + query, init))
}

it('submits a published package reference only to the account origin', async () => {
  const fetch = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.href).toBe('https://qingclaw.example/auth-api/v0/dsh/plugin-publications')
    expect(init.redirect).toBe('error')
    expect(new Headers(init.headers).get('X-DSH-Auth-Token')).toBe('host-only')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ package_name: '@qinglion/blender', version: '1.0.0' })
    return Response.json({ id: 3, state: 'pending' }, { status: 201 })
  })
  vi.stubGlobal('fetch', fetch)
  const response = await route()('action=submit&package_name=@qinglion/blender&version=1.0.0&registry=https://other.example', {
    method: 'POST', headers: { 'content-type': 'application/json' },
  })
  expect(response.status).toBe(201)
  expect(response.headers.get('X-DSH-Auth-Token')).toBeNull()
  expect(await response.json()).toEqual({ id: 3, state: 'pending' })
})

it('rejects sign-out, malformed routes and cross-origin form submissions before fetching', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect((await route(false)('action=users')).status).toBe(401)
  expect((await route()('action=list&id=../1', { method: 'POST' })).status).toBe(400)
  expect((await route()('action=role&id=7&role=admin', { method: 'POST' })).status).toBe(415)
  expect(fetch).not.toHaveBeenCalled()
})

it('preserves server denial for a creator calling an admin action', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'admin_role_required' }, { status: 403 })))
  const res = await route()('action=users')
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ error: 'admin_role_required' })
})

it('rejects binary submissions, missing versions, and the old npm publish action', async () => {
  const website = vi.fn()
  vi.stubGlobal('fetch', website)
  const handle = route()
  expect((await handle('action=submit', { method: 'POST', headers: { 'content-type': 'application/octet-stream' } })).status).toBe(415)
  const init = { method: 'POST', headers: { 'content-type': 'application/json' } }
  expect((await handle('action=submit&package_name=@qinglion/example', init)).status).toBe(422)
  expect((await handle('action=publish&id=1', init)).status).toBe(400)
  expect(website).not.toHaveBeenCalled()
})

it('routes registry inventory and owner assignments to the admin API', async () => {
  const website = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({}))
  vi.stubGlobal('fetch', website)
  const handle = route()
  expect((await handle('action=packages&scope=mine')).status).toBe(200)
  expect(website.mock.calls[0]![0].href).toBe('https://qingclaw.example/auth-api/v0/dsh/registry/packages?scope=all')
  const init = { method: 'POST', headers: { 'content-type': 'application/json' } }
  expect((await handle('action=owner&package_name=@qinglion/demo&owner_id=42', init)).status).toBe(200)
  const [url, request] = website.mock.calls[1]!
  expect(url.pathname).toBe('/auth-api/v0/dsh/registry/packages/owner')
  expect(request.method).toBe('PATCH')
  expect(JSON.parse(String(request.body))).toEqual({ package_name: '@qinglion/demo', owner_id: '42' })
})
