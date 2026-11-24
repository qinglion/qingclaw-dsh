import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-workspace'
import { PROJECT_PATH } from './types.ts'
import type { PluginProject, WorkspacePluginState } from './project-types.ts'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function readManifest(directory: string): Promise<Record<string, unknown>> {
  try {
    const path = join(directory, 'package.json')
    if (!(await lstat(path)).isFile()) return {}
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 256 * 1024) return {}
      const data = Buffer.alloc(stat.size)
      const { bytesRead } = await file.read(data, 0, data.length, 0)
      const parsed: unknown = JSON.parse(data.toString('utf8', 0, bytesRead))
      return record(parsed)
    } finally {
      await file.close()
    }
  } catch {
    // An empty directory or a manifest still being written can become a plugin later.
    return {}
  }
}

function pluginProject(manifest: Record<string, unknown>): PluginProject | undefined {
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
    name, version, title: text(dsh.displayName) ?? text(manifest.displayName) ?? name,
    kind: panelId ? 'workbench' : skill ? 'skill' : 'plugin',
    ...(description && { description }), ...(author && { author }), ...(panelId && { panelId }),
  }
}

/**
 * Read one directory's manifest. The creator center passes the workspace root;
 * publishing passes the package directory the request names, so a collection
 * workspace can publish any plugin package it holds.
 * @param directory - absolute directory holding a `package.json`.
 * @returns the recognized project, or undefined when the manifest declares none.
 */
export async function detectPluginProject(directory: string): Promise<PluginProject | undefined> {
  return pluginProject(await readManifest(await realpath(directory)))
}

/**
 * Directories one lookup may inspect before asking for an explicit directory.
 * A collection workspace stays far below this; dependency and VCS trees are
 * skipped rather than counted.
 */
const MAX_LOOKUP_DIRECTORIES = 10_000

/**
 * Find the workspace directories whose manifest declares exactly this package
 * and version. Publishing uses it when the request names no directory, so a
 * collection workspace resolves its own subdirectory instead of the model
 * guessing one. The shallowest directory wins because a copy nested deeper is
 * a pack or build artifact, not the project; equal depths report ambiguity.
 * Hidden, dependency, and linked directories are never entered.
 * @param root - the workspace real path.
 * @param name - exact package name.
 * @param version - exact package version.
 * @returns matching workspace-relative directories, `.` for the root; more than one means equal depth.
 */
export async function findPluginPackages(root: string, name: string, version: string): Promise<string[]> {
  let level: { relative: string; directory: string }[] = [{ relative: '.', directory: root }]
  let inspected = 0
  while (level.length) {
    const found: string[] = []
    const next: { relative: string; directory: string }[] = []
    for (const { relative, directory } of level) {
      if (++inspected > MAX_LOOKUP_DIRECTORIES) {
        throw new Error('工作区目录过多，请指定要发布的包目录。')
      }
      const project = await detectPluginProject(directory)
      if (project?.name === name && project.version === version) {
        found.push(relative)
        if (found.length > 1) return found
      }
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
        next.push({ relative: relative === '.' ? entry.name : relative + '/' + entry.name, directory: join(directory, entry.name) })
      }
    }
    if (found.length) return found
    level = next
  }
  return []
}

/**
 * Cache creator access per desktop grant for repeated local manifest scans.
 * @param ctx - Host context providing the signed-in account.
 * @returns a reader that reports creator access for the current grant.
 */
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
    if (!allowed && role.check === check) role = undefined
    return allowed
  }
}

/** One registered workspace the project route may inspect. */
export interface ProjectWorkspace {
  readonly path: string
}

/** What the project route reads; the creator center owns it. */
export interface ProjectRouteInputs {
  /** Whether the caller holds creator access. */
  canReadProjects(): Promise<boolean>
  /** Resolve the registered workspace named by the request's `workspace` parameter. */
  workspace(id: string | null): ProjectWorkspace | undefined
}

/**
 * Answer one discovery request: the plugin the workspace root manifest
 * declares, when any. Discovery never changes what the workspace can publish;
 * the publishing tool is offered to every signed-in creator.
 * @param inputs - resolved access and workspace lookup.
 * @returns the Fetch handler for {@link registerProjectRoutes}.
 */
export function projectRoute(inputs: ProjectRouteInputs): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!await inputs.canReadProjects()) {
      return Response.json({ error: 'creator_required' }, { status: 403 })
    }
    const workspace = inputs.workspace(new URL(request.url).searchParams.get('workspace'))
    if (!workspace) return Response.json({ error: 'workspace_not_found' }, { status: 404 })
    let project: PluginProject | undefined
    try {
      project = await detectPluginProject(workspace.path)
    } catch {
      return Response.json({ error: 'workspace_unavailable' }, { status: 404 })
    }
    const state: WorkspacePluginState = { ...(project && { project }) }
    return Response.json(state, { headers: { 'cache-control': 'no-store' } })
  }
}

/**
 * Serve the discovery route over registered workspaces received from the local desktop client.
 * @param ctx - Host context providing the connection and workspace registry.
 * @param canReadProjects - creator access reader; defaults to the account-backed one.
 * @returns the effect disposer removing the route.
 */
export function registerProjectRoutes(ctx: Context, canReadProjects = createProjectAccess(ctx)): () => Promise<void> {
  return ctx.connection.fetch.register({
    path: PROJECT_PATH, methods: ['GET'], requestBody: 'buffered',
    fetch: projectRoute({
      canReadProjects,
      workspace: id => ctx.workspaceRegistry.list().find(item => item.id === id),
    }),
  })
}
