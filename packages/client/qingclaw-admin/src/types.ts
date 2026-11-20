export type QingClawUserRole = 'user' | 'creator' | 'admin'

export interface QingClawUser {
  readonly id: number
  readonly name: string | null
  readonly email: string
  readonly role: QingClawUserRole
  readonly created_at: string
}

export interface PluginPublication {
  readonly id: number
  readonly package_name: string
  readonly title: string
  readonly version: string
  readonly resource_type: 'plugin' | 'skill'
  readonly state: 'pending' | 'publishing' | 'published' | 'failed' | 'rejected' | 'delisted' | 'superseded'
  readonly submitted_by?: { readonly id: number; readonly name: string | null; readonly role: QingClawUserRole }
  readonly listing_blocked_by_version?: boolean
  readonly current?: boolean
  readonly submitted_at?: string
  readonly published_at?: string
  readonly error?: string
}

export interface RegistryPackage {
  readonly package_name: string
  readonly owner_id: number | null
  readonly current_market_version?: string | null
  readonly highest_market_version?: string | null
  readonly latest_version: string | null
  readonly description: string
  readonly versions: ReadonlyArray<{
    readonly version: string
    readonly listing_blocked_by_version?: boolean
    readonly published_at: string | null
  }>
}

export const CONTROL_PATH = '/api/qingclaw-market/manage'
