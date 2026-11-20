/** Metadata read from package manifests in one registered plugin workspace. */
export interface PluginProject {
  directory: string
  name: string
  version: string
  title: string
  kind: 'plugin' | 'workbench' | 'skill'
  description?: string
  author?: string
  panelId?: string
}
