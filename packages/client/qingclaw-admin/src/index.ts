import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { CONTROL_PATH } from './types.ts'

export const inject = ['connection', 'deepseekAccount']
const PUBLICATIONS = '/auth-api/v0/dsh/plugin-publications'
const USERS = '/auth-api/v0/dsh/admin/users'

/** Connection admits only the owner peer to exact Fetch routes. The website authorizes the account role. */
export function apply(ctx: Context): void {
  const manage = async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams
    const action = params.get('action')
    const id = params.get('id') ?? ''
    const session = await ctx.deepseekAccount.getPlatformSession()
    if (!session) return Response.json({ error: 'signed_out' }, { status: 401 })
    let path: string
    let method = request.method
    let body: string | undefined
    const headers = new Headers(session.requestHeaders)
    headers.set('X-DSH-Auth-Token', session.token)
    if (method === 'GET' && action === 'publications') {
      path = PUBLICATIONS
    } else if (method === 'GET' && action === 'packages') {
      path = '/auth-api/v0/dsh/registry/packages?scope=all'
    } else if (method === 'POST' && action === 'owner') {
      if (request.headers.get('content-type') !== 'application/json') return new Response(null, { status: 415 })
      const owner = params.get('owner_id')
      const packageName = params.get('package_name')
      if (!owner || !/^\d+$/.test(owner) || !packageName) return new Response(null, { status: 400 })
      method = 'PATCH'
      path = '/auth-api/v0/dsh/registry/packages/owner'
      headers.set('content-type', 'application/json')
      body = JSON.stringify({ package_name: packageName, owner_id: owner })
    } else if (method === 'GET' && action === 'users') {
      path = USERS + '?' + new URLSearchParams({ q: params.get('q') ?? '' }).toString()
    } else if (method === 'POST' && action === 'submit') {
      if (request.headers.get('content-type') !== 'application/json') return new Response(null, { status: 415 })
      const packageName = params.get('package_name')?.trim()
      const version = params.get('version')?.trim()
      if (!packageName || !version) return Response.json({ error: 'registry_reference_required' }, { status: 422 })
      path = PUBLICATIONS
      headers.set('content-type', 'application/json')
      body = JSON.stringify({ package_name: packageName, version })
    } else if (method === 'POST' && /^\d+$/.test(id) && (action === 'list' || action === 'delist' || action === 'reject' || action === 'role')) {
      if (request.headers.get('content-type') !== 'application/json') return new Response(null, { status: 415 })
      headers.set('content-type', 'application/json')
      if (action === 'role') {
        const role = params.get('role')
        if (role !== 'user' && role !== 'creator' && role !== 'admin') return new Response(null, { status: 400 })
        method = 'PATCH'
        path = USERS + '/' + id + '/role'
        body = JSON.stringify({ role })
      } else {
        path = PUBLICATIONS + '/' + id + '/' + action
        body = JSON.stringify(action === 'reject' ? { reason: params.get('reason') ?? '' } : {})
      }
    } else {
      return new Response(null, { status: 400 })
    }
    try {
      const response = await fetch(new URL(path, session.origin), {
        method, headers, body: body ?? null, redirect: 'error', signal: request.signal,
      })
      if (!response.headers.get('content-type')?.includes('application/json')) {
        return Response.json({ error: 'unexpected_website_response' }, { status: response.ok ? 502 : response.status })
      }
      return new Response(response.body, { status: response.status, headers: {
        'content-type': 'application/json', 'cache-control': 'no-store',
      } })
    } catch (error) {
      if (request.signal.aborted) throw error
      return Response.json({ error: 'website_unreachable' }, { status: 502 })
    }
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: CONTROL_PATH, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: manage,
  }), 'qingclaw-admin: market management')
}
