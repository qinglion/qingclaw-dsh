import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-workspace'
import { PROJECT_PATH } from './types.ts'
import type { PluginProject, PublishCandidate, WorkspacePluginState } from './project-types.ts'

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
 * Resolve one directory named relative to a root, rejecting absolute paths,
 * parent segments, and links that leave the root.
 * @param root - the real path the request is relative to.
 * @param directory - the request's relative directory, `.` for the root.
 * @returns the real directory path.
 */
export async function packageDirectory(root: string, directory: string): Promise<string> {
  const segments = directory.split('/')
  if (directory !== '.' && (!/^[a-zA-Z0-9._@-]+(?:\/[a-zA-Z0-9._@-]+)*$/.test(directory)
    || segments.some(segment => segment === '.' || segment === '..'))) {
    throw new Error('包目录必须是工作区内的相对路径。')
  }
  const resolved = join(root, directory)
  if (await realpath(resolved).catch(() => undefined) !== resolved) throw new Error('工作区目录已变更。')
  return resolved
}

/** The Session working-directory service this package reads when the composition mounts it. */
interface WorkingDirectoryReader {
  get(session: Session): string
}

/**
 * Directory a Session works in: its current directory, which is its branch
 * worktree for a Session created on a branch, or the directory it was created in.
 * @param ctx - Host context that may provide the working-directory service.
 * @param session - Session to locate.
 * @returns the absolute directory.
 */
export function sessionDirectory(ctx: Context, session: Session): string {
  const service = ctx.get('workingDirectory') as WorkingDirectoryReader | undefined
  const root = service?.get(session) ?? session.header.cwd
  if (root === undefined) throw new Error('当前会话没有工作目录，无法定位要发布的包。')
  return root
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

/** Depth of one workspace-relative directory; `.` is the root. */
function depth(directory: string): number {
  return directory === '.' ? 0 : directory.split('/').length
}

/**
 * List every plugin package a workspace holds, shallowest first. The publish
 * panel offers these candidates; discovery keeps reading only the root.
 * Hidden, dependency, and linked directories are never entered.
 * @param root - the workspace real path.
 * @returns candidate directories, `.` for the root, in breadth-first order.
 */
export async function listPluginPackages(root: string): Promise<PublishCandidate[]> {
  const candidates: PublishCandidate[] = []
  let level: { relative: string; directory: string }[] = [{ relative: '.', directory: root }]
  let inspected = 0
  while (level.length) {
    const next: { relative: string; directory: string }[] = []
    for (const { relative, directory } of level) {
      if (++inspected > MAX_LOOKUP_DIRECTORIES) {
        throw new Error('工作区目录过多，请指定要发布的包目录。')
      }
      const project = await detectPluginProject(directory)
      if (project) candidates.push({ directory: relative, project })
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
    level = next
  }
  return candidates
}

/**
 * Find the workspace directories whose manifest declares exactly this package
 * and version. Publishing uses it when the request names no directory, so a
 * collection workspace resolves its own subdirectory instead of the model
 * guessing one. The shallowest directory wins because a copy nested deeper is
 * a pack or build artifact, not the project; equal depths report ambiguity.
 * @param root - the workspace real path.
 * @param name - exact package name.
 * @param version - exact package version.
 * @returns matching workspace-relative directories, `.` for the root; more than one means equal depth.
 */
export async function findPluginPackages(root: string, name: string, version: string): Promise<string[]> {
  const matches = (await listPluginPackages(root))
    .filter(candidate => candidate.project.name === name && candidate.project.version === version)
  if (matches.length === 0) return []
  const shallowest = Math.min(...matches.map(candidate => depth(candidate.directory)))
  return matches.filter(candidate => depth(candidate.directory) === shallowest).map(candidate => candidate.directory)
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
  /** Resolve the registered workspace named by the request's `workspace` parameter. */
  workspace(id: string | null): ProjectWorkspace | undefined
  /** Resolve the directory of the Session named by the request's `session` parameter. */
  session(id: string | null): string | undefined
}

/**
 * Resolve one absolute directory that must already exist. A Session keeps the
 * directory it started in after that directory moves or disappears, so every
 * candidate is checked before it becomes the root of a read.
 * @param value - a candidate directory from a Session, a Workspace, or the client.
 * @returns the real path, when it names an existing directory.
 */
async function existingDirectory(value: string | null | undefined): Promise<string | undefined> {
  if (value === null || value === undefined || !isAbsolute(value)) return
  try {
    return await realpath(value)
  } catch {
    return
  }
}

/**
 * Answer one discovery request: the plugin the requested directory's manifest
 * declares, when any. The publish page asks with `session` for the Session's
 * own directory and names a `directory` inside it only when the root holds no
 * plugin; the creator center asks with `workspace` for its inventory.
 * @param inputs - workspace and session lookups.
 * @returns the Fetch handler for {@link registerProjectRoutes}.
 */
export function projectRoute(inputs: ProjectRouteInputs): (request: Request) => Promise<Response> {
  return async (request) => {
    // A local manifest read: the owner peer already reads these directories, and
    // the creator surfaces are mounted for creators only. The account gate stays
    // on the operations that publish, where the website authorizes each write.
    const params = new URL(request.url).searchParams
    const headers = { 'cache-control': 'no-store' }
    // A Session the Host has not materialized still has a directory the client
    // holds, so the client may supply it; the Session stays authoritative. Each
    // candidate must exist, because a Session keeps the directory it started in.
    const root = await existingDirectory(inputs.session(params.get('session')))
      ?? await existingDirectory(inputs.workspace(params.get('workspace'))?.path)
      ?? await existingDirectory(params.get('cwd'))
    if (root === undefined) {
      return Response.json({ error: 'target_not_found', detail: 'no_candidate' }, { status: 404 })
    }
    const directory = params.get('directory')
    try {
      const project = await detectPluginProject(
        directory === null ? root : await packageDirectory(root, directory),
      )
      const state: WorkspacePluginState = { ...(project && { project }) }
      return Response.json(state, { headers })
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unreadable'
      return Response.json({ error: 'directory_unavailable', detail: code }, { status: 404 })
    }
  }
}

/**
 * Serve the discovery route over registered workspaces received from the local desktop client.
 * @param ctx - Host context providing the connection and workspace registry.
 * @returns the effect disposer removing the route.
 */
export function registerProjectRoutes(ctx: Context): () => Promise<void> {
  return ctx.connection.fetch.register({
    path: PROJECT_PATH, methods: ['GET'], requestBody: 'buffered',
    fetch: projectRoute({
      workspace: id => ctx.workspaceRegistry.list().find(item => item.id === id),
      session: (id) => {
        const session = id === null ? undefined : ctx.sessions.get(id as SessionId)
        if (session === undefined) return
        try {
          return sessionDirectory(ctx, session)
        } catch {
          return undefined
        }
      },
    }),
  })
}
