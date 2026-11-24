/** QingClaw feedback row replacing the built-in questionnaire entry. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import { createFeedbackStore } from './feedback-store.ts'
import { FeedbackDialogEntry, type FeedbackDialogInjected } from './FeedbackDialogEntry.tsx'
import { FeedbackEntry, type FeedbackEntryInjected } from './FeedbackEntry.tsx'
import { en, zh } from './locales.ts'

const NS = 'qingclaw.feedback'
/** Services required by the feedback row and its dialog. */
export const inject = ['slots', 'locale']

/** Occupy the account menu's feedback cell and host its dialog above the shell. @param ctx - client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }), 'qingclaw-feedback: dictionaries')
  const dialog = createFeedbackStore()
  ctx.slots.inject('settings.launcher.feedback', () => ctx.slots.register({
    name: 'settings.launcher.feedback', locale: NS, priority: -10,
    inject: (): FeedbackEntryInjected => ({ showDialog: (restoreFocus) => { dialog.show(restoreFocus) } }),
  }, FeedbackEntry))
  // The dialog lives in the frame overlay so closing the account menu cannot unmount it.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'qingclaw-feedback', locale: NS,
    inject: (): FeedbackDialogInjected => ({
      hooks: { dialog: { getSnapshot: () => dialog.getSnapshot(), subscribe: listener => dialog.subscribe(listener) } },
      close: () => { dialog.hide() },
    }),
  }, FeedbackDialogEntry))
}
