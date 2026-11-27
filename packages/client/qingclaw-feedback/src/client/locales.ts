/** Feedback row and QR dialog copy. */
export const zh = {
  entry: '意见反馈',
  close: '关闭',
  description: '微信扫码添加创始人镐赞微信，直接反馈使用问题',
  qrAlt: '创始人镐赞微信二维码',
} as const
/** Locale keys for the feedback row and dialog. */
export type FeedbackKey = keyof typeof zh
/** English copy; other languages fall back to it. */
export const en: Record<FeedbackKey, string> = {
  entry: 'Feedback',
  close: 'Close',
  description: 'Scan the code to add the founder on WeChat and send your feedback directly',
  qrAlt: 'Founder WeChat QR code',
}
