/** Sidebar footer feedback entry: opens the shared WeChat QR dialog. */
import { useRef } from 'react'
import { IconPaperPlaneOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeedbackKey } from './locales.ts'
import css from './FeedbackAction.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.feedback': FeedbackKey }
}

/** Dialog command supplied by the plugin's apply closure. */
export interface FeedbackActionInjected {
  /** Show the dialog and remember the focus to restore when it closes.
   * @param restoreFocus - returns focus to the footer control after the dialog closes.
   */
  showDialog: (restoreFocus: () => void) => void
}

/** Composed props of the QingClaw feedback control. */
export type FeedbackActionProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'qingclaw.feedback'> & InjectFace<FeedbackActionInjected>

/**
 * @param props - sidebar width, the dialog command, and localized copy.
 * @returns the feedback footer control.
 */
export function FeedbackAction({ wide, showDialog, t }: FeedbackActionProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const label = t('entry')
  return <Tooltip label={label} side={wide ? 'top' : 'right'} portal>
    <button ref={trigger} type="button" className={css.button} aria-label={label}
      onClick={() => { showDialog(() => { trigger.current?.focus() }) }}>
      <IconPaperPlaneOutlineMedium size={17} />
    </button>
  </Tooltip>
}
