/** Account-menu feedback row: opens the shared WeChat QR dialog. */
import { IconPaperPlaneOutlineMedium, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeedbackKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.feedback': FeedbackKey }
}

/** Dialog command supplied by the plugin's apply closure. */
export interface FeedbackEntryInjected {
  /** Show the dialog and remember the launcher focus to restore when it closes.
   * @param restoreFocus - returns focus to the account launcher after the dialog closes.
   */
  showDialog: (restoreFocus: () => void) => void
}

/** Composed props of the QingClaw feedback row. */
export type FeedbackEntryProps = PropsRuntime<'settings.launcher.feedback'> & PropsLocale<'qingclaw.feedback'> & InjectFace<FeedbackEntryInjected>

/**
 * @param props - menu dismissal, focus restoration, the dialog command, and localized copy.
 * @returns the feedback menu row.
 */
export function FeedbackEntry({ onDismiss, restoreFocus, showDialog, t }: FeedbackEntryProps) {
  return <MenuItemButton icon={<IconPaperPlaneOutlineMedium size={16} />}
    onSelect={() => { showDialog(restoreFocus); onDismiss() }}>
    {t('entry')}
  </MenuItemButton>
}
