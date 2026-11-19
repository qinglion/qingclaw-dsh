import { afterEach, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { CONTROL_PATH } from '../src/types.ts'

afterEach(() => vi.unstubAllGlobals())
function route(authenticated = true) {
  let handle: (request: Request) => Promise<Response>
  const origin = 'https://qingclaw.example'
  apply({
    effect: (start: () => unknown) => start(),
    deepseekAccount: { getPlatformSession: async () => authenticated ? { origin, token: 'host-only', requestHeaders: {} } : null },
    connection: { fetch: { register: (options: { path: string; fetch: typeof handle }) => {
      expect(options.path).toBe(CONTROL_PATH)
      handle = options.fetch
    } } },
  } as unknown as Context)
  return (query: string, init?: RequestInit) => handle(new Request('http://localhost' + CONTROL_PATH + '?' + query, init))
}

it('sends the original binary artifact and metadata only to the account origin', async () => {
  const bytes = Uint8Array.from([31, 139, 8, 0, 255])
  const fetch = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.href).toBe('https://qingclaw.example/auth-api/v0/dsh/plugin-publications')
    expect(init.redirect).toBe('error')
    expect(new Headers(init.headers).get('X-DSH-Auth-Token')).toBe('host-only')
    const form = init.body as FormData
    expect(form.get('title_zh')).toBe('Blender')
    expect(new Uint8Array(await (form.get('artifact') as Blob).arrayBuffer())).toEqual(bytes)
    return Response.json({ id: 3, state: 'pending' }, { status: 201 })
  })
  vi.stubGlobal('fetch', fetch)
  const response = await route()('action=submit&title=Blender', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes })
  expect(response.status).toBe(201)
  expect(response.headers.get('X-DSH-Auth-Token')).toBeNull()
  expect(await response.json()).toEqual({ id: 3, state: 'pending' })
})

it('rejects sign-out, malformed routes and cross-origin form submissions before fetching', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect((await route(false)('action=users')).status).toBe(401)
  expect((await route()('action=publish&id=../1', { method: 'POST' })).status).toBe(400)
  expect((await route()('action=role&id=7&role=admin', { method: 'POST' })).status).toBe(415)
  expect(fetch).not.toHaveBeenCalled()
})

it('preserves server denial for a creator calling an admin action', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'admin_role_required' }, { status: 403 })))
  const res = await route()('action=users')
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ error: 'admin_role_required' })
})
