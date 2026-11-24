/** One public QingClaw video entry normalized from the official Feed v1 response. */
export interface WorkbenchVideo {
  readonly id: string
  readonly title: string
  readonly coverUrl?: string
  readonly duration?: string
  readonly publishedAt?: string
  readonly courseTitle?: string
  readonly watchUrl: string
}

/** One public QingClaw course entry normalized from the official Feed v1 response. */
export interface WorkbenchCourse {
  readonly id: string
  readonly title: string
  readonly coverUrl?: string
  readonly lessonCount: number
  readonly courseUrl: string
}

/** Official Feed v1 fields after the Host has validated and normalized them. */
export interface WorkbenchFeed {
  readonly schemaVersion: 1
  readonly revision: string
  readonly updatedAt?: string
  readonly latestVideos: readonly WorkbenchVideo[]
  readonly featuredCourses: readonly WorkbenchCourse[]
  readonly links: {
    readonly allCourses: string
  }
}

/** Where the Host obtained the returned view of the official feed. */
export type WorkbenchFeedSource = 'network' | 'cache' | 'last-good'

/** Feed value and freshness metadata returned to the browser. */
export interface WorkbenchFeedResult {
  readonly feed: WorkbenchFeed
  readonly source: WorkbenchFeedSource
  readonly stale: boolean
}


/** QingClaw model entitlement projected for professional-plugin gates. */
export interface ProEntitlement {
  readonly active: boolean
  readonly plan: string | null
  readonly endsAt: string | null
}

/** An official desktop workbench already adapted to the Cordis bundle protocol. */
export interface WorkbenchCatalogEntry {
  readonly packageName: string
  readonly version: string
  readonly panelId: string
  readonly title: string
  readonly description: string
  readonly author: string
  readonly category: string
  readonly registry: string
  readonly previewUrl?: string
  readonly repositoryUrl?: string
}

/** What the Host reported for a workbench installation the browser requested. */
export interface WorkbenchInstallResult {
  readonly application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  /** Why the installation ended without applying, when the Host reported a reason. */
  readonly diagnostic?: string
}

/** Entries may be shown offline. New installation requires a successful refresh. */
export interface WorkbenchCatalogResult {
  readonly entries: WorkbenchCatalogEntry[]
  readonly stale: boolean
}
