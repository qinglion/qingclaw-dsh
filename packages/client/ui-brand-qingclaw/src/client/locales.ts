/** QingClaw brand dictionaries. */

/** Locale namespace owned by the QingClaw brand UI. */
export const NS = 'qingclaw.brand'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  brandName: '青狮龙虾',
} satisfies Record<string, string>

/** QingClaw brand locale key union. */
export type QingClawBrandKey = keyof typeof zh

/** English dictionary. */
export const en = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** Japanese dictionary. */
export const ja = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** Spanish dictionary. */
export const es = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** French dictionary. */
export const fr = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** German dictionary. */
export const de = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** Russian dictionary. */
export const ru = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

/** Portuguese dictionary. */
export const pt = {
  brandName: 'QingClaw',
} satisfies Record<QingClawBrandKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** QingClaw brand copy. */
    'qingclaw.brand': QingClawBrandKey
  }
}
