/** Shell-overlay projection of the shared feedback dialog. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FeedbackDialog } from './FeedbackDialog.tsx'

/** Visibility source and the dialog's close command, supplied by the plugin's apply closure. */
export interface FeedbackDialogInjected {
  hooks: { dialog: HostObservable<{ open: boolean }> }
  close: () => void
}

/** Composed props of the feedback dialog overlay. */
export type FeedbackDialogEntryProps = PropsRuntime<'shell.overlay'> & PropsLocale<'qingclaw.feedback'> & InjectFace<FeedbackDialogInjected>

/**
 * @param props - dialog visibility, the close command, and localized copy.
 * @returns the dialog while open; the overlay renders nothing otherwise.
 */
export function FeedbackDialogEntry({ useDialog, close, t }: FeedbackDialogEntryProps) {
  const { open } = useDialog(value => value)
  return open ? <FeedbackDialog close={close} t={t} /> : null
}
