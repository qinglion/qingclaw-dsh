/** Metadata read from a plugin package manifest. */
export interface PluginProject {
  name: string
  version: string
  title: string
  kind: 'plugin' | 'workbench' | 'skill'
  description?: string
  author?: string
  panelId?: string
}

/** One plugin package a workspace holds, as the publish panel offers it. */
export interface PublishCandidate {
  /** Directory relative to the workspace root; `.` for the root itself. */
  directory: string
  project: PluginProject
}

/** What one workspace's root manifest discloses to the creator center. */
export interface WorkspacePluginState {
  /** Recognized plugin package at the workspace root; absent when the root manifest declares none. */
  project?: PluginProject
  /** Why the root manifest could not be read, when the read failed instead of finding nothing. */
  warning?: string
}
