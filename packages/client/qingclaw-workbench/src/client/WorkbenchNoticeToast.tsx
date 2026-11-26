/** Transient workbench failures, hosted by the shell overlay so a panel switch cannot drop them. */
import type { ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchNotice } from './workbench-plugin-store.ts'
import type { NS } from './locales.ts'

/** Failure the market is reporting now, and its dismissal. */
export interface WorkbenchNoticeInjected {
  hooks: { notice: HostObservable<WorkbenchNotice | undefined> }
  /** Clear the notice once its toast finished. */
  dismissNotice(): void
}

/** Composed props of the transient workbench notice. */
export type WorkbenchNoticeProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS> & InjectFace<WorkbenchNoticeInjected>

/** Full-opacity hold: a failure notice names the operation, so it outlives the one-line default. */
const NOTICE_HOLD_MS = 6000

/**
 * @param props - the current failure, its localized copy, and dismissal.
 * @returns the shared floating toast, or null while the market reports nothing.
 */
export function WorkbenchNoticeToast({ useNotice, dismissNotice, t }: WorkbenchNoticeProps): ReactNode {
  const notice = useNotice(current => current)
  if (notice === undefined) return null
  return <Toast key={notice.seq} text={t(notice.key)} holdMs={NOTICE_HOLD_MS}
    icon={<IconWarningOutlineRegular />} onDone={dismissNotice} />
}
