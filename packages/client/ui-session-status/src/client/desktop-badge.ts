/** Desktop application badge: unread turn completions counted over the listed Sessions. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: declares the `sessions` Controller service.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DesktopAttentionBridge } from '../types.ts'
import type { SessionStatusSnapshot, UiSessionStatus } from './status.ts'

/**
 * Count the listed Sessions whose latest completed turn is still unread.
 * @param ids - top-level Session identities the workspace lists; subagent catalogs are absent.
 * @param statuses - current Session status table.
 * @returns the number of unread completions.
 */
export function unreadCompletionCount(ids: readonly SessionId[], statuses: SessionStatusSnapshot): number {
  let count = 0
  for (const id of ids) {
    if (statuses.get(id)?.completionUnread === true) count++
  }
  return count
}

/**
 * Report the unread completion count to the Desktop shell, which badges the application icon.
 *
 * Browsers and shells without an icon badge expose no bridge and keep no badge. The count follows the
 * reminders the workspace rows show: reading a Session, including by opening it in the visible, focused
 * main view, lowers it, and disposing the plugin removes the badge.
 * @param ctx - Client root context supplying the Session list.
 * @param status - Session status table whose reminders the badge mirrors.
 */
export function installDesktopBadge(ctx: Context, status: UiSessionStatus): void {
  const attention = desktopAttentionBridge()
  if (attention === undefined) return
  let published: number | undefined
  const publish = (): void => {
    const count = unreadCompletionCount(ctx.sessions.list.getSnapshot().ids, status.getSnapshot())
    if (count === published) return
    published = count
    attention.update(count)
  }
  ctx.effect(() => {
    const disposeStatus = status.subscribe(publish)
    const disposeList = ctx.sessions.list.subscribe(publish)
    publish()
    return () => {
      disposeStatus()
      disposeList()
      if (published !== 0) attention.update(0)
      published = 0
    }
  }, 'session-status: Desktop application badge')
}

/** Read the shell bridge; a preload exposes it only to the Desktop application document. */
function desktopAttentionBridge(): DesktopAttentionBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { dshDesktop?: { attention?: DesktopAttentionBridge } }).dshDesktop?.attention
}
