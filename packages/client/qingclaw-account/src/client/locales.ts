/** QingClaw account credit copy; languages without a translation fall back to English. */

export const en = {
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
