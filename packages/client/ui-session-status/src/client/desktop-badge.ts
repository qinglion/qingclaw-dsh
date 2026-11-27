/** Desktop application badge: unread turn completions for listed, unarchived Sessions. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: declares the `sessions` Controller service.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: declares the `workspaces` Controller service.
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DesktopAttentionBridge } from '../types.ts'
import type { SessionStatusSnapshot, UiSessionStatus } from './status.ts'

/**
 * Count unread completions among listed, unarchived Sessions.
 * @param ids - top-level Session identities the workspace lists; subagent catalogs are absent.
 * @param statuses - current Session status table.
 * @param archived - Session identities archived in the Workspace registry.
 * @returns the number of unread completions.
 */
export function unreadCompletionCount(
  ids: readonly SessionId[], statuses: SessionStatusSnapshot, archived: ReadonlySet<SessionId>,
): number {
  let count = 0
  for (const id of ids) {
    if (!archived.has(id) && statuses.get(id)?.completionUnread === true) count++
  }
  return count
}

/**
 * Report the unread completion count to the Desktop shell, which badges the application icon.
 *
 * The badge stays clear until the Workspace Controller's first archive snapshot. It updates when a
 * Session's reading or archive state changes, and clears when the Desktop binding is disposed.
 * @param ctx - Client plugin context supplying the Session list.
 * @param status - Session status table whose reminders the badge mirrors.
 * @returns the Desktop binding's fiber, or undefined without a Desktop bridge.
 */
export function installDesktopBadge(ctx: Context, status: UiSessionStatus): ReturnType<Context['inject']> | undefined {
  const attention = desktopAttentionBridge()
  if (attention === undefined) return
  const sessions = ctx.sessions.list
  return ctx.inject(['workspaces'], (scope) => {
    const workspaces = scope.workspaces.list
    let published: number | undefined
    const publish = (): void => {
      const { phase, archivedSessionIds } = workspaces.getSnapshot()
      const count = phase === 'ready'
        ? unreadCompletionCount(sessions.getSnapshot().ids, status.getSnapshot(), new Set(archivedSessionIds))
        : 0
      if (count === published) return
      published = count
      attention.update(count)
    }
    scope.effect(() => {
      const disposeStatus = status.subscribe(publish)
      const disposeSessions = sessions.subscribe(publish)
      const disposeWorkspaces = workspaces.subscribe(publish)
      publish()
      return () => {
        disposeWorkspaces()
        disposeSessions()
        disposeStatus()
        if (published !== 0) attention.update(0)
      }
    }, 'session-status: Desktop application badge')
  })
}

/** Read the shell bridge; a preload exposes it only to the Desktop application document. */
function desktopAttentionBridge(): DesktopAttentionBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { dshDesktop?: { attention?: DesktopAttentionBridge } }).dshDesktop?.attention
}
