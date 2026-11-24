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

/** What one workspace's root manifest discloses to the creator center. */
export interface WorkspacePluginState {
  /** Recognized plugin package at the workspace root; absent when the root manifest declares none. */
  project?: PluginProject
}
