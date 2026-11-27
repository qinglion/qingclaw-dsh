/** Upgrade prompt copy for the QingClaw entitlement gate. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'qingclaw.entitlement'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '需要专业版',
  body: '「{name}」需要专业版授权。当前账号未开通或已到期，升级后即可继续使用。',
  upgrade: '去升级',
  later: '稍后',
}

/** English dictionary mirroring {@link zh}. */
export const en: typeof zh = {
  title: 'Professional plan required',
  body: '"{name}" needs a professional licence. This account has no active subscription; upgrade to keep using it.',
  upgrade: 'Upgrade',
  later: 'Not now',
}

/** Every locale key this plugin registers. */
export type EntitlementKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** QingClaw workbench upgrade prompt. */
    'qingclaw.entitlement': EntitlementKey
  }
}
