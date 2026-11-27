/** Owner-peer fetch route. The Host attaches QingClaw account credentials. */
export const CREATOR_PATH = '/api/qingclaw-creator/account'

/** Workspace project route: the plugin the workspace root manifest declares. */
export const PROJECT_PATH = '/api/qingclaw-creator/project'

export interface CreatorVersion {
  version: string
  published_at?: string | null
  listing_blocked_by_version?: boolean
  market_state?: string | null
  review_note?: string | null
}

export interface CreatorPackage {
  name: string
  /** Market listing title for this package, resolved to the package name when no application carries one. */
  title: string
  description: string
  current_market_version?: string | null
  highest_market_version?: string | null
  latest_version: string | null
  versions: CreatorVersion[]
}
