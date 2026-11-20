import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-workspace'
import { glob } from 'tinyglobby'
import { parse } from 'yaml'
import type { CreatorVersion } from './types.ts'
import type { PluginProject } from './project-types.ts'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function readMetadata(path: string, parseFile: (source: string) => unknown): Promise<Record<string, unknown>> {
  try {
    if (!(await lstat(path)).isFile()) return {}
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 256 * 1024) return {}
      const data = Buffer.alloc(stat.size)
      const { bytesRead } = await file.read(data, 0, data.length, 0)
      return record(parseFile(data.toString('utf8', 0, bytesRead)))
    } finally {
      await file.close()
    }
  } catch {
    // An empty directory or a manifest still being written can become a plugin later.
    return {}
  }
}

function pluginProject(manifest: Record<string, unknown>, directory: string): PluginProject | undefined {
  const dsh = record(manifest.dsh)
  const qingclaw = record(manifest.qingclaw)
  const panelId = text(record(qingclaw.workbench).panelId)
  const name = text(manifest.name)
  const version = text(manifest.version)
  const skill = qingclaw.resourceType === 'skill'
  const plugin = Object.keys(dsh).length > 0 || Object.keys(record(manifest.cordis)).length > 0 || qingclaw.resourceType === 'plugin'
    || !!record(manifest.engines).dsh || (Array.isArray(manifest.keywords) && manifest.keywords.includes('dsh-plugin'))
    || Object.keys(record(manifest.peerDependencies)).some(key => key.startsWith('@deepseek-ai/dsh-'))
  if (!name || !version || !(plugin || skill || panelId)) return
  const description = text(manifest.description)
  const author = text(manifest.author) ?? text(record(manifest.author).name)
  return {
    directory, name, version, title: text(dsh.displayName) ?? text(manifest.displayName) ?? name,
    kind: panelId ? 'workbench' : skill ? 'skill' : 'plugin',
    ...(description && { description }), ...(author && { author }), ...(panelId && { panelId }),
  }
}

/** Inspect the root and declared npm/pnpm workspace members, never following links outside the workspace. */
export async function detectPluginProjects(path: string): Promise<PluginProject[]> {
  const root = await realpath(path)
  const [manifest, pnpm] = await Promise.all([
    readMetadata(join(root, 'package.json'), JSON.parse), readMetadata(join(root, 'pnpm-workspace.yaml'), parse),
  ])
  const projects: PluginProject[] = []
  const rootProject = pluginProject(manifest, '.')
  if (rootProject) projects.push(rootProject)
  const npm = Array.isArray(manifest.workspaces) ? manifest.workspaces : record(manifest.workspaces).packages
  const patterns = Array.isArray(pnpm.packages) ? pnpm.packages : npm
  if (!Array.isArray(patterns)) return projects
  const members = patterns.filter((p): p is string => typeof p === 'string' && !isAbsolute(p.replace(/^!/, ''))
    && !p.includes('..') && !p.includes('\\') && !p.includes(':'))
  if (!members.length) return projects
  const dirs = await glob(members, { cwd: root, onlyDirectories: true, followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**'], dot: false })
  for (const member of dirs.sort()) {
    const dir = member.replace(/\/$/, '')
    const real = await realpath(join(root, dir)).catch(() => undefined)
    if (!real) continue
    const local = relative(root, real).split(sep).join('/')
    if (!local || local !== dir || isAbsolute(local)) continue
    const project = pluginProject(await readMetadata(join(real, 'package.json'), JSON.parse), dir)
    if (project) projects.push(project)
  }
  return projects
}

/** Read only version metadata exposed for this exact package by the QingClaw registry. */
export async function readRegistryHistory(name: string, signal: AbortSignal): Promise<CreatorVersion[]> {
  if (!/^@qinglion\/[a-z0-9][a-z0-9._~-]*$/.test(name)) return []
  const registry = 'https://npm.qingclaw.com/'
  const response = await fetch(new URL(encodeURIComponent(name), registry), {
    headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  })
  if (response.status === 404) return []
  if (!response.ok) throw new Error('registry_unavailable')
  const body = record(await response.json())
  if (body.name !== name || typeof body.versions !== 'object' || body.versions === null || Array.isArray(body.versions)) {
    throw new Error('invalid_registry_response')
  }
  const times = record(body.time)
  return Object.keys(body.versions).map((version) => {
    const date = times[version]
    const published_at = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null
    return { version, published_at }
  }).sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
}

/** Cache creator access per desktop grant for repeated local manifest scans. */
export function createProjectAccess(ctx: Context): () => Promise<boolean> {
  // Directory probes are local and repeat while the user edits. Share the role lookup for this
  // grant; writes (registry publish and listing) are independently authorized by their server.
  let role: { token: string; until: number; check: Promise<boolean> } | undefined
  return async (): Promise<boolean> => {
    const session = await ctx.deepseekAccount.getPlatformSession()
    if (!session) { role = undefined; return false }
    if (role?.token === session.token && role.until > Date.now()) return role.check
    const check = ctx.deepseekAccount.getProfile({ version: process.env.DSH_CLIENT_VERSION ?? '0.0.0',
      locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }).then(profile => profile?.status === 'ready' && (profile.value.role === 'admin' || profile.value.role === 'creator')).catch(() => false)
    role = { token: session.token, until: Date.now() + 120_000, check }
    const allowed = await check
    if (!allowed && role?.check === check) role = undefined
    return allowed
  }
}

/** Resolve only registered workspace IDs received from the local desktop client. */
export function registerProjectRoutes(ctx: Context, canReadProjects = createProjectAccess(ctx)): () => void {
  return ctx.connection.fetch.register({ path: '/api/qingclaw-creator/project', methods: ['GET'], requestBody: 'buffered', fetch: async (request) => {
    if (!await canReadProjects()) {
      return Response.json({ error: 'creator_required' }, { status: 403 })
    }
    const id = new URL(request.url).searchParams.get('workspace')
    const workspace = ctx.workspaceRegistry.list().find(item => item.id === id)
    if (!workspace) return Response.json({ error: 'workspace_not_found' }, { status: 404 })
    try {
      const projects = await detectPluginProjects(workspace.path)
      const name = new URL(request.url).searchParams.get('package')
      const headers = { 'cache-control': 'no-store' }
      if (name === null) return Response.json({ projects }, { headers })
      if (!projects.some(project => project.name === name)) return Response.json({ error: 'project_not_found' }, { status: 404 })
      try {
        return Response.json({ versions: await readRegistryHistory(name, request.signal) }, { headers })
      } catch {
        return Response.json({ error: 'registry_unavailable' }, { status: 502 })
      }
    } catch {
      return Response.json({ error: 'workspace_unavailable' }, { status: 404 })
    }
  } })
}
