/** QingClaw account copy; languages without a translation fall back to English. */

export const en = {
  planEndsAt: 'Ends {date}',
  nav: 'QingClaw account',
  signedOutTitle: 'Sign in to QingClaw',
  signedOutHint: 'Sign in with your QingClaw website account to use the built-in models and credits.',
  signIn: 'Sign in',
  signOut: 'Sign out',
  signOutConfirm: 'Tasks are still running. Sign out anyway?',
  signOutConfirmAction: 'Sign out anyway',
  cancel: 'Cancel',
  refresh: 'Refresh',
  topUp: 'Top up',
  planFree: 'Free',
  planPro: 'Pro',
  planTeam: 'Team',
  quotaBannerEmpty: 'No credits remaining. Top up to continue.',
  quotaBannerLow: 'Credits running low. Remaining:',
  quotaBannerAction: 'Top up',
  quotaSourceValue: 'Credit source: {source}',
  quotaTotal: 'Total credits',
  quotaUnknown: 'Unavailable',
  quotaTrial: 'Trial grant',
  quotaPurchased: 'Top-ups',
  quotaRemaining: 'Available credits',
  quotaManage: 'Manage usage',
}

export type AccountKey = keyof typeof en

export const zh: Record<AccountKey, string> = {
  planEndsAt: '到期 {date}',
  nav: '青狮账号',
  signedOutTitle: '登录青狮账号',
  signedOutHint: '用青狮官网账号登录后即可使用内置模型与额度。',
  signIn: '登录',
  signOut: '退出登录',
  signOutConfirm: '还有任务在运行，确定退出登录吗？',
  signOutConfirmAction: '仍然退出',
  cancel: '取消',
  refresh: '刷新',
  topUp: '去充值',
  planFree: '免费版',
  planPro: '专业版',
  planTeam: '团队版',
  quotaBannerEmpty: '额度已用完，请充值后继续',
  quotaBannerLow: '额度即将用完，剩余：',
  quotaBannerAction: '去充值',
  quotaSourceValue: '额度来源：{source}',
  quotaTotal: '总额度',
  quotaUnknown: '暂不可用',
  quotaTrial: '试用额度',
  quotaPurchased: '充值额度',
  quotaRemaining: '可用额度',
  quotaManage: '管理用量',
}

/** Shipped languages without an owned translation reuse the English copy. */
export const ja: Record<AccountKey, string> = en
export const es: Record<AccountKey, string> = en
export const fr: Record<AccountKey, string> = en
export const de: Record<AccountKey, string> = en
export const ru: Record<AccountKey, string> = en
export const pt: Record<AccountKey, string> = en
