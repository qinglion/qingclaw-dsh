/** QingClaw feedback control in the sidebar footer and the dialog it opens. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createFeedbackStore } from './feedback-store.ts'
import { FeedbackDialogEntry, type FeedbackDialogInjected } from './FeedbackDialogEntry.tsx'
import { FeedbackAction, type FeedbackActionInjected } from './FeedbackAction.tsx'
import { en, zh } from './locales.ts'

const NS = 'qingclaw.feedback'
/** Services required by the feedback control and its dialog. */
export const inject = ['slots', 'locale']

/** Occupy a sidebar footer cell and host the dialog above the shell. @param ctx - client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }), 'qingclaw-feedback: dictionaries')
  const dialog = createFeedbackStore()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'qingclaw-feedback', order: 40, locale: NS,
    inject: (): FeedbackActionInjected => ({ showDialog: (restoreFocus) => { dialog.show(restoreFocus) } }),
  }, FeedbackAction))
  // The dialog lives in the frame overlay so navigating away cannot unmount it.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'qingclaw-feedback', locale: NS,
    inject: (): FeedbackDialogInjected => ({
      hooks: { dialog: { getSnapshot: () => dialog.getSnapshot(), subscribe: listener => dialog.subscribe(listener) } },
      close: () => { dialog.hide() },
    }),
  }, FeedbackDialogEntry))
}
