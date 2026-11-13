/** Localized copy for the QingClaw Workbench page and sidebar entry. */

/** Locale namespace owned by the Workbench feature. */
export const NS = 'qingclaw.workbench'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  panel: '青狮工作台',
  title: '青狮工作台',
  subtitle: '从青狮官网同步最新公开课程与视频。',
  refresh: '刷新内容',
  refreshing: '正在刷新',
  officialSite: '访问青狮龙虾官网',
  courseCenter: '进入课程中心',
  dailyQuote: '今日寄语',
  quote1: '慢一点没关系，只要方向仍然清楚。',
  quote2: '今天不必解决所有问题，推进最重要的一步就很好。',
  quote3: '把复杂的事理清，是专业；把重要的人照顾好，是生活。',
  quote4: '真正的从容，是知道什么值得现在完成。',
  quote5: '每一次耐心梳理，都会让混乱离答案更近。',
  quote6: '允许事情有过程，也允许自己有节奏。',
  quote7: '清醒比匆忙重要，稳定比热闹长久。',
  quote8: '先把眼前的一页写好，远方自然会慢慢展开。',
  latestVideos: '最新视频',
  latestVideosDescription: '精选近期公开内容，点击后在官网观看。',
  featuredCourses: '精选课程',
  featuredCoursesDescription: '继续系统学习，完整内容在青狮龙虾官网查看。',
  watchVideo: '观看视频',
  openCourse: '查看课程',
  lessons: '{count} 节公开课',
  allCourses: '查看全部课程',
  loading: '正在同步官网内容…',
  unavailableTitle: '官网内容暂时无法加载',
  unavailableDescription: '请检查网络后重试，工作台不会影响其他功能。',
  retry: '重试',
  stale: '官网内容暂时无法更新，当前显示上次成功同步的版本。',
  emptyVideos: '暂时还没有公开视频。',
  emptyCourses: '暂时还没有公开课程。',
} satisfies Record<string, string>

/** Workbench locale key union. */
export type WorkbenchLocaleKey = keyof typeof zh

/** English dictionary and fallback for the remaining shipped locales. */
export const en = {
  panel: 'QingClaw Workbench',
  title: 'QingClaw Workbench',
  subtitle: 'Latest public courses and videos, synchronized from the QingClaw website.',
  refresh: 'Refresh content',
  refreshing: 'Refreshing',
  officialSite: 'Visit the QingClaw website',
  courseCenter: 'Open the course center',
  dailyQuote: 'Thought for today',
  quote1: 'It is okay to move slowly when the direction remains clear.',
  quote2: 'You do not need to solve everything today; move the most important step forward.',
  quote3: 'Making complexity clear is craft; caring for what matters is life.',
  quote4: 'Real composure is knowing what deserves to be finished now.',
  quote5: 'Every patient pass through the details moves disorder closer to an answer.',
  quote6: 'Let work have a process, and let yourself have a pace.',
  quote7: 'Clarity matters more than haste; steadiness lasts longer than noise.',
  quote8: 'Write the page in front of you well, and the distance will open in time.',
  latestVideos: 'Latest videos',
  latestVideosDescription: 'Recent public lessons. Watch them on the official website.',
  featuredCourses: 'Featured courses',
  featuredCoursesDescription: 'Continue structured learning on the QingClaw website.',
  watchVideo: 'Watch video',
  openCourse: 'Open course',
  lessons: '{count} public lessons',
  allCourses: 'View all courses',
  loading: 'Syncing official content…',
  unavailableTitle: 'Official content is temporarily unavailable',
  unavailableDescription: 'Check your connection and try again. Other Workbench features are unaffected.',
  retry: 'Retry',
  stale: 'The official feed could not be refreshed. Showing the last successful version.',
  emptyVideos: 'No public videos are available yet.',
  emptyCourses: 'No public courses are available yet.',
} satisfies Record<WorkbenchLocaleKey, string>

export const ja = { ...en } satisfies Record<WorkbenchLocaleKey, string>
export const es = { ...en } satisfies Record<WorkbenchLocaleKey, string>
export const fr = { ...en } satisfies Record<WorkbenchLocaleKey, string>
export const de = { ...en } satisfies Record<WorkbenchLocaleKey, string>
export const ru = { ...en } satisfies Record<WorkbenchLocaleKey, string>
export const pt = { ...en } satisfies Record<WorkbenchLocaleKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** QingClaw Workbench navigation and learning-content copy. */
    'qingclaw.workbench': WorkbenchLocaleKey
  }
}
