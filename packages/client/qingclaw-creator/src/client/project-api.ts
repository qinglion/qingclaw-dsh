import { creatorFetch } from './api.ts'
import { PROJECT_PATH } from '../types.ts'
import type { WorkspacePluginState } from '../project-types.ts'

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
  const body: WorkspacePluginState = await response.json()
  return body
}
