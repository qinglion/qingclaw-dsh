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
  readonly state: 'pending' | 'publishing' | 'published' | 'failed' | 'rejected'
  readonly submitted_by?: { readonly id: number; readonly name: string | null; readonly role: QingClawUserRole }
  readonly submitted_at?: string
  readonly published_at?: string
  readonly error?: string
}

export const CONTROL_PATH = '/api/qingclaw-market/manage'
export const MAX_PACKAGE_BYTES = 25 * 1024 * 1024
