import { creatorFetch } from './api.ts'
import { PROJECT_PATH } from '../types.ts'
import type { PublishCandidate, WorkspacePluginState } from '../project-types.ts'

const stateUrl = (workspaceId: string): URL => {
  const url = new URL(PROJECT_PATH.slice(1), document.baseURI)
  url.searchParams.set('workspace', workspaceId)
  return url
}

/**
 * Read the plugin the workspace root manifest declares.
 * @param workspaceId - registered workspace id.
 * @param signal - aborts the request.
 * @returns the detected root project, when any.
 */
export async function getWorkspacePluginState(workspaceId: string, signal: AbortSignal): Promise<WorkspacePluginState> {
  const response = await creatorFetch(stateUrl(workspaceId), { method: 'GET', signal })
  if (response.status === 401 || response.status === 403) throw new Error('creator_required')
  if (!response.ok) throw new Error('workspace_unavailable')
  const body: WorkspacePluginState = await response.json()
  return body
}

/**
 * Read every plugin package the workspace holds, for the publish panel.
 * @param workspaceId - registered workspace id.
 * @param signal - aborts the request.
 * @returns the candidates, shallowest first.
 */
export async function getWorkspacePublishCandidates(workspaceId: string, signal: AbortSignal): Promise<PublishCandidate[]> {
  const url = stateUrl(workspaceId)
  url.searchParams.set('scope', 'candidates')
  const response = await creatorFetch(url, { method: 'GET', signal })
  if (response.status === 401 || response.status === 403) throw new Error('creator_required')
  if (!response.ok) throw new Error('workspace_unavailable')
  const body = await response.json() as { candidates: PublishCandidate[] }
  return body.candidates
}
