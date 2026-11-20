import { creatorFetch } from './api.ts'
import type { CreatorVersion } from '../types.ts'
import type { PluginProject } from '../project-types.ts'

/** Resolve registered workspace identifiers through the local desktop owner connection. */
export async function getWorkspaceProjects(workspaceId: string, signal: AbortSignal): Promise<PluginProject[]> {
  const url = new URL('api/qingclaw-creator/project', document.baseURI)
  url.searchParams.set('workspace', workspaceId)
  const response = await creatorFetch(url, { method: 'GET', signal })
  if (response.status === 401 || response.status === 403) throw new Error('creator_required')
  if (!response.ok) throw new Error('workspace_unavailable')
  const body: { projects: PluginProject[] } = await response.json()
  return body.projects
}

/** A recognized package's readable npm releases, independent of its maintainer assignment. */
export async function getProjectVersions(workspaceId: string, name: string, signal: AbortSignal): Promise<CreatorVersion[]> {
  const url = new URL('api/qingclaw-creator/project', document.baseURI)
  url.search = new URLSearchParams({ workspace: workspaceId, package: name }).toString()
  const response = await creatorFetch(url, { method: 'GET', signal })
  if (!response.ok) throw new Error('registry_unavailable')
  const body: { versions: CreatorVersion[] } = await response.json()
  return body.versions
}
