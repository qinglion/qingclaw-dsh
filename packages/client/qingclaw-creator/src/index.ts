import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { registerPublishSkill } from './publish-skill.ts'
import { registerPublishTool } from './publish-tool.ts'
import { createProjectAccess, registerProjectRoutes } from './project.ts'
import { CREATOR_PATH } from './types.ts'

export const inject = ['workspaceRegistry', 'sessions', 'deepseekAccount', 'connection', 'skills', 'tools']

const root = '/auth-api/v0/dsh'
const routes = {
  packages: ['GET', root + '/registry/packages?scope=mine'],
  applications: ['GET', root + '/plugin-publications?mine=1'],
  submit: ['POST', root + '/plugin-publications'],
} as const

/** Expose only these account actions to the local owner. The website authorizes each write. */
export function apply(ctx: Context): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: '__DSH_HIDDEN_PRESET_CHOICES__', value: ['cordis'] })
  })
  const canReadProjects = createProjectAccess(ctx)
  registerPublishSkill(ctx)
  registerPublishTool(ctx, canReadProjects)
  ctx.effect(() => registerProjectRoutes(ctx, canReadProjects), 'qingclaw-creator: workspace projects')
  ctx.effect(() => ctx.connection.fetch.register({
    path: CREATOR_PATH, methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      const params = new URL(request.url).searchParams
      const action = params.get('action')
      if (!action || !Object.hasOwn(routes, action)) return new Response(null, { status: 400 })
      const [method, path] = routes[action as keyof typeof routes]
      if (request.method !== (method === 'GET' ? 'GET' : 'POST')) return new Response(null, { status: 405 })
      if (method !== 'GET' && request.headers.get('content-type') !== 'application/json') return new Response(null, { status: 415 })
      const session = await ctx.deepseekAccount.getPlatformSession()
      if (!session) return Response.json({ error: 'signed_out' }, { status: 401 })
      const headers = new Headers(session.requestHeaders)
      headers.set('X-DSH-Auth-Token', session.token)
      headers.set('accept', 'application/json')
      headers.set('content-type', 'application/json')
      let body: string | undefined
      if (action === 'submit') {
        const name = params.get('package_name'), version = params.get('version')
        if (!name || !version) return new Response(null, { status: 400 })
        body = JSON.stringify({ package_name: name, version })
      }
      try {
        const response = await fetch(new URL(path, session.origin), {
          method, headers, body: body ?? null, redirect: 'error', signal: request.signal,
        })
        const empty = response.status === 204
        if (!empty && !response.headers.get('content-type')?.includes('application/json')) {
          return Response.json({ error: 'unexpected_website_response' }, { status: response.ok ? 502 : response.status })
        }
        return new Response(empty ? null : response.body, {
          status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      } catch (error) {
        if (request.signal.aborted) throw error
        return Response.json({ error: 'website_unreachable' }, { status: 502 })
      }
    },
  }), 'qingclaw-creator: account routes')
}
