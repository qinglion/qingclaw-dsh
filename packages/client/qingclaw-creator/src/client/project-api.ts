import { creatorFetch } from './api.ts'
import { PROJECT_PATH } from '../types.ts'
import type { PluginProject, WorkspacePluginState } from '../project-types.ts'

async function projectAt(query: Record<string, string>, signal: AbortSignal): Promise<PluginProject | undefined> {
  const url = new URL(PROJECT_PATH.slice(1), document.baseURI)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const response = await creatorFetch(url, { method: 'GET', signal })
  if (response.status === 401 || response.status === 403) throw new Error('creator_required')
  if (!response.ok) throw new Error('directory_unavailable')
  const body = await response.json() as WorkspacePluginState
  return body.project
}

/**
 * Read the plugin the Session's own directory declares.
 * @param sessionId - the Session whose directory is inspected.
 * @param cwd - the Session directory the client holds, when the Host cannot resolve the Session.
 * @param signal - aborts the request.
 * @returns the detected project, when the manifest declares one.
 */
export async function getSessionPlugin(
  sessionId: string, cwd: string | undefined, signal: AbortSignal,
): Promise<PluginProject | undefined> {
  return projectAt({ session: sessionId, ...(cwd ? { cwd } : {}) }, signal)
}

/**
 * Read the plugin a directory inside the Session's directory declares.
 * @param sessionId - the Session whose directory the path is relative to.
 * @param directory - relative directory, `.` for the Session directory itself.
 * @param cwd - the Session directory the client holds, when the Host cannot resolve the Session.
 * @param signal - aborts the request.
 * @returns the detected project, when the manifest declares one.
 */
export async function getSessionProjectAt(
  sessionId: string, directory: string, cwd: string | undefined, signal: AbortSignal,
): Promise<PluginProject | undefined> {
  return projectAt({ session: sessionId, directory, ...(cwd ? { cwd } : {}) }, signal)
}

/**
 * Read the plugin the workspace root manifest declares.
 * @param workspaceId - registered workspace id.
 * @param signal - aborts the request.
 * @returns the detected root project, when any.
 */
export async function getWorkspacePluginState(workspaceId: string, signal: AbortSignal): Promise<WorkspacePluginState> {
  const url = new URL(PROJECT_PATH.slice(1), document.baseURI)
  url.searchParams.set('workspace', workspaceId)
  const response = await creatorFetch(url, { method: 'GET', signal })
  if (response.status === 401 || response.status === 403) throw new Error('creator_required')
  if (!response.ok) throw new Error('workspace_unavailable')
  const body = await response.json() as WorkspacePluginState
  return body
}
