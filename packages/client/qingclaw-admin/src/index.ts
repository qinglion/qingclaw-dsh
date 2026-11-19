import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { CONTROL_PATH, MAX_PACKAGE_BYTES } from './types.ts'

export const inject = ['connection', 'deepseekAccount']
const PUBLICATIONS = '/auth-api/v0/dsh/plugin-publications'
const USERS = '/auth-api/v0/dsh/admin/users'

/** Connection admits only the owner peer to exact Fetch routes. The website authorizes the account role. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: CONTROL_PATH, methods: ['GET', 'POST'], requestBody: 'streaming',
    fetch: async (request) => {
      const params = new URL(request.url).searchParams
      const action = params.get('action')
      const id = params.get('id') ?? ''
      const session = await ctx.deepseekAccount.getPlatformSession()
      if (!session) return Response.json({ error: 'signed_out' }, { status: 401 })
      let path: string
      let method = request.method
      let body: FormData | string | undefined
      const headers = new Headers(session.requestHeaders)
      headers.set('X-DSH-Auth-Token', session.token)
      if (method === 'GET' && action === 'publications') {
        path = PUBLICATIONS
      } else if (method === 'GET' && action === 'users') {
        path = USERS + '?' + new URLSearchParams({ q: params.get('q') ?? '' }).toString()
      } else if (method === 'POST' && action === 'submit') {
        if (request.headers.get('content-type') !== 'application/octet-stream') return new Response(null, { status: 415 })
        const reader = request.body?.getReader()
        if (!reader) return Response.json({ error: 'artifact_required' }, { status: 422 })
        const chunks: Uint8Array<ArrayBuffer>[] = []
        let size = 0
        for (let part = await reader.read(); !part.done; part = await reader.read()) {
          size += part.value.byteLength
          if (size > MAX_PACKAGE_BYTES) {
            await reader.cancel()
            return Response.json({ error: 'package_too_large' }, { status: 413 })
          }
          chunks.push(new Uint8Array(part.value))
        }
        path = PUBLICATIONS
        headers.delete('content-type')
        body = new FormData()
        body.append('artifact', new Blob(chunks, { type: 'application/gzip' }), 'package.tgz')
        const title = params.get('title')
        if (title) body.append('title_zh', title)
      } else if (method === 'POST' && /^\d+$/.test(id) && (action === 'publish' || action === 'reject' || action === 'role')) {
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
    },
  }), 'qingclaw-admin: market management')
}
