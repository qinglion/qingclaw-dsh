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
