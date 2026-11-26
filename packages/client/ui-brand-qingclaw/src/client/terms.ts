/** Deployment wording that overrides copy owned by other packages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'

/** Keys the QingClaw distribution replaces, by namespace. */
export interface TermOverrides {
  readonly [namespace: string]: {
    readonly zh: Readonly<Record<string, string>>
    readonly en: Readonly<Record<string, string>>
  }
}

/** Wording this distribution owns instead of the package that declares the namespace. */
export const TERMS: TermOverrides = {
  'settings.account': {
    zh: {
      nav: '青狮账号',
      signedIn: '已登录青狮',
      backToHarness: '返回青狮',
      loginDescription: '登录青狮账号即可开始使用。你的项目和文件保存在本地。',
      signInDescription: '使用青狮账号开始使用。',
      settingsSignedOutTitle: '你尚未登录青狮',
      settingsSignedOutDescription: '登录青狮账号后即可继续使用内置模型与额度。',
      quotaDescription: '额度不足时无法开始新任务。充值后可继续，也可以稍后在「设置 → 青狮账号」里充值。',
    },
    en: {
      nav: 'QingClaw account',
      signedIn: 'Signed in to QingClaw',
      backToHarness: 'Back to QingClaw',
      loginDescription: 'Sign in with your QingClaw account to get started. Your projects and files are stored locally.',
      signInDescription: 'Use your QingClaw account to get started.',
      settingsSignedOutTitle: 'You are not signed in to QingClaw',
      settingsSignedOutDescription: 'Sign in to QingClaw to keep using the built-in models and credits.',
      quotaDescription: 'QingClaw cannot start a new task without credits. Top up to continue, or later in Settings → QingClaw account.',
    },
  },
}

/**
 * Register every deployment term as an override on its owning namespace.
 * @param ctx - client plugin context that owns the locale service.
 */
export function applyTerms(ctx: Context): void {
  for (const [namespace, dicts] of Object.entries(TERMS)) {
    ctx.effect(() => ctx.locale.override(namespace, dicts), `client-ui-brand-qingclaw: ${namespace} terms`)
  }
}
