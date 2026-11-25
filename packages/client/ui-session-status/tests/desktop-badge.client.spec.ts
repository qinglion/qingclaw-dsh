// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, expect, it, vi } from 'vitest'
import { installDesktopBadge, unreadCompletionCount } from '../src/client/desktop-badge.ts'
import { UiSessionStatus } from '../src/client/status.ts'
import type { SessionReadState } from '../src/types.ts'

const sessionId = (value: string): SessionId => value as SessionId
const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  Reflect.deleteProperty(window, 'dshDesktop')
})

function bench() {
  const update = vi.fn()
  Object.assign(window, { dshDesktop: { attention: { update } } })
  const ctx = new Context()
  roots.push(ctx)
  ctx.provide('remote', { $on: () => () => {}, sessionStatus: { mark: vi.fn() } } as never)
  const list = createSnapshotStore<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  const pending = createSnapshotStore<ReadonlyMap<SessionId, SessionPendingInteraction>>(new Map())
  const sessions: Pick<ISessions, 'list' | 'binding'> = { list, binding: () => undefined }
  ctx.provide('sessions', sessions as never)
  const status = new UiSessionStatus(ctx, sessions, pending)
  status.reading.replace([])
  const row = (id: SessionId): void => {
    list.update((draft) => {
      draft.ids.push(id)
      draft.byId[id] = { id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 1 }
    })
  }
  const record = (id: SessionId, value: Partial<SessionReadState> = {}): SessionReadState => ({
    sessionId: id, completedTurn: 1, failed: false, readTurn: 0, manualUnread: false, ...value,
  })
  return { ctx, list, status, update, row, record }
}

it('counts only listed Sessions whose latest completion is unread', () => {
  const b = bench()
  const listed = sessionId('listed')
  const unlisted = sessionId('subagent')
  b.row(listed)
  const statuses = new Map([
    [listed, { running: false, pendingInteraction: undefined, completionUnread: true, completionFailed: false }],
    [unlisted, { running: false, pendingInteraction: undefined, completionUnread: true, completionFailed: false }],
  ])
  expect(unreadCompletionCount([listed], statuses)).toBe(1)
  expect(unreadCompletionCount([listed, unlisted], statuses)).toBe(2)
  expect(unreadCompletionCount([listed], new Map())).toBe(0)
})

it('reports the unread completion count and lowers it when the Session is read', () => {
  const b = bench()
  const id = sessionId('finished')
  b.row(id)
  installDesktopBadge(b.ctx, b.status)
  expect(b.update).toHaveBeenLastCalledWith(0)
  b.status.reading.replace([b.record(id)])
  expect(b.update).toHaveBeenLastCalledWith(1)
  b.status.reading.replace([b.record(id, { readTurn: 1 })])
  expect(b.update).toHaveBeenLastCalledWith(0)
  expect(b.update).toHaveBeenCalledTimes(3)
})

it('ignores completions of Sessions the workspace does not list', () => {
  const b = bench()
  const listed = sessionId('listed')
  b.row(listed)
  installDesktopBadge(b.ctx, b.status)
  b.status.reading.replace([b.record(sessionId('subagent'))])
  expect(b.update).toHaveBeenCalledTimes(1)
  expect(b.update).toHaveBeenLastCalledWith(0)
})

it('counts explicit unread marks and sessions that appear after the completion', () => {
  const b = bench()
  installDesktopBadge(b.ctx, b.status)
  b.status.reading.replace([b.record(sessionId('later'), { readTurn: 1, manualUnread: true })])
  expect(b.update).toHaveBeenLastCalledWith(0)
  b.row(sessionId('later'))
  expect(b.update).toHaveBeenLastCalledWith(1)
})

it('republishes only when the count changes', () => {
  const b = bench()
  const first = sessionId('first')
  const second = sessionId('second')
  b.row(first)
  b.row(second)
  installDesktopBadge(b.ctx, b.status)
  b.status.reading.replace([b.record(first)])
  const published = b.update.mock.calls.length
  b.status.reading.replace([b.record(first), b.record(second)])
  expect(b.update).toHaveBeenCalledTimes(published + 1)
  expect(b.update).toHaveBeenLastCalledWith(2)
  // A further reading change that keeps the count republishes nothing.
  b.status.reading.replace([b.record(first, { failed: true }), b.record(second)])
  expect(b.update).toHaveBeenCalledTimes(published + 1)
})

it('keeps no badge without a Desktop bridge', () => {
  const b = bench()
  Reflect.deleteProperty(window, 'dshDesktop')
  const id = sessionId('finished')
  b.row(id)
  expect(() => { installDesktopBadge(b.ctx, b.status) }).not.toThrow()
  b.status.reading.replace([b.record(id)])
  expect(b.update).not.toHaveBeenCalled()
})

it('removes the badge when the plugin is disposed', async () => {
  const b = bench()
  const id = sessionId('finished')
  b.row(id)
  installDesktopBadge(b.ctx, b.status)
  b.status.reading.replace([b.record(id)])
  expect(b.update).toHaveBeenLastCalledWith(1)
  await b.ctx.fiber.dispose()
  expect(b.update).toHaveBeenLastCalledWith(0)
})
