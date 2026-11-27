// Adapted from DataElement DSH Desktop (MIT). See THIRD-PARTY-LICENSE.txt.
import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import WebSocket from 'ws'
import { MobileChatStream, mobileChatMethods, mobileChatRpc } from './mobile-chat-adapter.ts'

const MUX_RECONNECT_MS = 500
const MUX_RECONNECT_CAP_MS = 30_000

/** Gateway stream carrier: one WebSocket multiplexing every logical stream. */
const REMOTE_STREAM_MUX_PATH = '/api/remote.mux'
/** Gateway-internal stream delivering forwarded Cordis events. */
const REMOTE_EVENT_STREAM_ENDPOINT = '$events'
/** Gateway-internal unary endpoint settling one forwarded event. */
const REMOTE_EVENT_RESULT_ENDPOINT = '$events/result'
/** Waterfall event a Host raises when it needs an answer from the user. */
const USER_QUESTION_EVENT = 'user-questions/request'
const EVENT_STREAM_ID = 'mobile-events'
const WORKSPACE_STREAM_ID = 'mobile-workspaces'
const MUX_STABLE_MS = 5_000

interface MobileQuestionOption {
  label: string
  description?: string
}

interface MobileQuestion {
  id: string
  question: string
  detail?: string
  header?: string
  options?: MobileQuestionOption[]
  multiSelect?: boolean
  intent?: string
}

interface PendingMobileQuestion {
  rpcId: string
  sessionId: string
  questions: MobileQuestion[]
}

interface MobileQuestionAnswer {
  id: string
  selected: string[]
  custom?: string
}

export interface MobileHostOptions {
  harnessUrl(): string | undefined
  harnessCookie(): string | undefined
}

export class MobileHost {
  private readonly pendingQuestions = new Map<string, PendingMobileQuestion>()
  private readonly workspaceEvents = new EventEmitter()
  private readonly lifetime = new AbortController()
  private workspaceSnapshot: unknown
  private eventClientId: string | undefined
  constructor(private readonly options: MobileHostOptions) {
    void this.monitorMux(this.lifetime.signal).catch(() => undefined)
  }
  stop(): void {
    this.lifetime.abort()
    this.pendingQuestions.clear()
    this.workspaceSnapshot = undefined
  }
  async request(method: string, payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    if (method === 'interaction.pending') {
      const sessionId = requiredStringField(payload, 'sessionId')
      const pending = [...this.pendingQuestions.values()].find(item => item.sessionId === sessionId)
      return { ok: true, value: pending ?? null }
    }
    if (method === 'interaction.answer') {
      const answer = parseQuestionResponse(payload)
      const pending = this.assertPendingQuestion(answer.rpcId, answer.sessionId)
      validateQuestionAnswers(pending, answer.answers)
      const result = await this.respondToQuestion(answer.rpcId, {
        kind: 'result',
        value: { answers: answer.answers },
      })
      return result
    }
    if (method === 'interaction.cancel') {
      const rpcId = requiredStringField(payload, 'rpcId')
      const sessionId = requiredStringField(payload, 'sessionId')
      this.assertPendingQuestion(rpcId, sessionId)
      const result = await this.respondToQuestion(rpcId, {
        kind: 'rejected',
        error: {
          name: 'Error',
          message: 'the user closed this question request',
          code: 'cancelled',
        },
      })
      return result
    }
    if (typeof method !== 'string' || !mobileChatMethods.has(method)) {
      return { ok: false, error: 'RPC method is not available on mobile.' }
    }
    return this.forwardRpc(method, payload ?? {})
  }

  private async forwardRpc(method: string, payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    if (method === 'workspace.list' && this.workspaceSnapshot === undefined) {
      // The first authenticated navigation and workspace/follow start together.
      // Wait for the first snapshot so a fast phone does not open on a false error.
      await once(this.workspaceEvents, 'ready', { signal: AbortSignal.timeout(4000) }).catch(() => {})
    }
    return mobileChatRpc(method, payload, this.workspaceSnapshot, (endpoint, args) => this.invokeHarness(endpoint, args))
  }

  private async invokeHarness(
    endpoint: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    const base = this.options.harnessUrl()
    if (!base) return { ok: false, error: 'Harness is not ready.' }
    const rpcId = randomUUID()
    const response = await fetch(new URL(`/api/${endpoint}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: this.options.harnessCookie() ?? '' },
      redirect: 'error',
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
      signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(30_000)]),
    })
    if (!response.ok) return { ok: false, error: `Harness transport returned HTTP ${response.status}.` }
    const envelope = (await response.json()) as {
      rpcId?: unknown
      result?: { ok?: unknown; value?: unknown; error?: { message?: unknown } }
    }
    if (envelope.rpcId !== rpcId) return { ok: false, error: 'Harness RPC response did not match the request.' }
    if (envelope.result?.ok !== true) {
      const message = envelope.result?.error?.message
      return { ok: false, error: typeof message === 'string' ? message : 'Harness rejected the request.' }
    }
    return { ok: true, value: envelope.result.value }
  }

  private async monitorMux(signal: AbortSignal): Promise<void> {
    let lastBase: string | undefined
    // A Harness that never accepts the downlink used to be retried at a flat
    // 500ms for as long as the app ran. Backing off turns a permanent failure
    // into two attempts a minute instead of a hundred.
    let backoffMs = MUX_RECONNECT_MS
    const backOff = async (): Promise<void> => {
      await waitFor(backoffMs, signal)
      backoffMs = Math.min(backoffMs * 2, MUX_RECONNECT_CAP_MS)
    }

    while (!signal.aborted) {
      const base = this.options.harnessUrl()
      if (!base) {
        this.pendingQuestions.clear()
        await backOff()
        continue
      }
      if (base !== lastBase) {
        this.workspaceSnapshot = undefined
        this.pendingQuestions.clear()
        lastBase = base
        backoffMs = MUX_RECONNECT_MS
      }
      let openedAt: number | undefined
      try {
        await this.consumeMux(base, signal, () => {
          openedAt = Date.now()
        })
        backoffMs = MUX_RECONNECT_MS
      } catch {
        signal.throwIfAborted()
        this.pendingQuestions.clear()
        // A connection that held for a while and then dropped is a transient
        // fault, not a Harness that refuses the downlink: retry promptly.
        if (openedAt !== undefined && Date.now() - openedAt >= MUX_STABLE_MS) {
          backoffMs = MUX_RECONNECT_MS
        }
        await backOff()
      }
    }
  }

  private async consumeMux(base: string, signal: AbortSignal, onOpen?: () => void): Promise<void> {
    // 0.1.2-alpha.1 replaced the event mux with the Gateway stream carrier:
    // one WebSocket multiplexing logical streams, each opened by name. The
    // forwarded-event stream is `$events`, and the upgrade itself is
    // authenticated, so it carries the same session cookie as the unary calls.
    const url = new URL(REMOTE_STREAM_MUX_PATH, base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const cookie = this.options.harnessCookie()
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: cookie === undefined ? {} : { cookie },
      })
      // `ws` raises 'error' asynchronously when close() aborts a still-CONNECTING
      // socket ("WebSocket was closed before the connection was established") —
      // exactly what finish() below does to unwind on abort. cleanup() has
      // already removed the real handleError listener by the time that fires,
      // so without a permanent sink here that self-inflicted error becomes an
      // unhandled 'error' event and crashes the process.
      socket.addEventListener('error', () => {})
      let settled = false
      const cleanup = (): void => {
        signal.removeEventListener('abort', handleAbort)
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('close', handleClose)
        socket.removeEventListener('error', handleError)
      }
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close()
        }
        if (error) reject(error)
        else resolve()
      }
      const handleAbort = (): void => {
        finish()
      }
      const handleOpen = (): void => {
        onOpen?.()
        this.pendingQuestions.clear()
        this.eventClientId = undefined
        // Two logical streams share this carrier: the forwarded events that
        // raise questions, and the workspace projection whose opening
        // `baseline` frame is the list the Host no longer serves unary.
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId: EVENT_STREAM_ID,
            endpoint: REMOTE_EVENT_STREAM_ENDPOINT,
            payload: { args: {} },
          }),
        )
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId: WORKSPACE_STREAM_ID,
            endpoint: 'workspace/follow',
            payload: { args: {} },
          }),
        )
      }
      const handleMessage = (event: { data: unknown }): void => {
        const data = event.data
        if (typeof data === 'string') this.consumeMuxEnvelope(data)
        else if (Buffer.isBuffer(data)) this.consumeMuxEnvelope(data.toString('utf8'))
      }
      const handleClose = (): void => {
        finish(signal.aborted ? undefined : new Error('Harness mux WebSocket closed.'))
      }
      const handleError = (): void => {
        finish(new Error('Harness mux WebSocket failed.'))
      }
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose, { once: true })
      socket.addEventListener('error', handleError, { once: true })
      signal.addEventListener('abort', handleAbort, { once: true })
      if (signal.aborted) handleAbort()
    })
  }

  /** Forward one native Harness session/follow stream to an authenticated phone as SSE. */
  async stream(sessionId: string, signal: AbortSignal, emit: (value: Record<string, unknown>) => void): Promise<void> {
    const base = this.options.harnessUrl()
    if (!base) throw new Error('Harness is not ready.')
    const cookie = this.options.harnessCookie()
    const url = new URL(REMOTE_STREAM_MUX_PATH, base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const streamId = `mobile-session-${randomUUID()}`
    const presentation = new MobileChatStream()
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(url, { headers: cookie === undefined ? {} : { cookie } })
      // `ws` raises 'error' asynchronously when close() aborts a still-CONNECTING
      // socket ("WebSocket was closed before the connection was established") —
      // exactly what finish() below does to unwind on abort. cleanup() has
      // already removed the real handleError listener by the time that fires,
      // so without a permanent sink here that self-inflicted error becomes an
      // unhandled 'error' event and crashes the process. consumeMux guards the
      // same close pattern with the identical sink; keep the two in lockstep.
      socket.addEventListener('error', () => {})
      let settled = false
      const cleanup = (): void => {
        signal.removeEventListener('abort', finish)
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('close', handleClose)
        socket.removeEventListener('error', handleError)
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        cleanup()
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
        resolve()
      }
      const handleOpen = (): void => {
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId,
            endpoint: 'session/follow',
            payload: {
              args: {
                request: { address: { kind: 'session', sessionId }, maxMessages: 100, assistantStream: true },
              },
            },
          }),
        )
      }
      const handleMessage = (event: { data: unknown }): void => {
        const text =
          typeof event.data === 'string' ? event.data : Buffer.isBuffer(event.data) ? event.data.toString('utf8') : undefined
        if (!text) return
        let frame: unknown
        try {
          frame = JSON.parse(text)
        } catch {
          return
        }
        if (!isRecord(frame) || frame.streamId !== streamId) return
        if (frame.type === 'item') {
          const value = presentation.accept(frame.value)
          if (!value) return
          emit(value)
        } else if (frame.type === 'error' || frame.type === 'end') {
          finish()
        }
      }
      const handleClose = (): void => {
        finish()
      }
      const handleError = (): void => {
        finish()
      }
      signal.addEventListener('abort', finish, { once: true })
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose, { once: true })
      socket.addEventListener('error', handleError, { once: true })
      if (signal.aborted) finish()
    })
  }

  /**
   * Consume one carrier frame.
   *
   * Every logical stream shares this socket, so a frame is routed by its
   * `streamId` first. The event stream replaces the old `server-request`
   * envelopes: a question now arrives as a `waterfall` frame carrying its own
   * `eventId`, which is also the id the phone answers with, and the opening
   * `ready` frame names the generation every answer has to quote.
   */
  private consumeMuxEnvelope(data: string): void {
    let frame: unknown
    try {
      frame = JSON.parse(data)
    } catch {
      return
    }
    if (!isRecord(frame) || frame.type !== 'item') return
    const value = frame.value
    if (frame.streamId === WORKSPACE_STREAM_ID) {
      // The phone filters its session list by this snapshot. A session created
      // after connect arrives as an increment, so keeping only the opening
      // baseline hides it until the follow stream reconnects.
      if (isRecord(value)) {
        this.workspaceSnapshot = applyWorkspaceFollowFrame(this.workspaceSnapshot, value)
        if (this.workspaceSnapshot !== undefined) this.workspaceEvents.emit('ready')
      }
      return
    }
    if (frame.streamId !== EVENT_STREAM_ID || !isRecord(value)) return
    if (value.type === 'ready' && typeof value.clientId === 'string') {
      this.eventClientId = value.clientId
      return
    }
    if (value.type === 'waterfall' && value.event !== USER_QUESTION_EVENT) {
      // Tell the Host this subscriber has no UI for the interaction. A desktop
      // observer keeps its own pending delivery and decides it independently.
      const eventId = value.eventId
      if (typeof eventId === 'string' && this.eventClientId) {
        void this.invokeHarness(REMOTE_EVENT_RESULT_ENDPOINT, {
          clientId: this.eventClientId,
          eventId,
          outcome: { kind: 'next' },
        }).catch(() => {})
      }
      return
    }
    if (value.type === 'waterfall' && value.event === USER_QUESTION_EVENT) {
      const eventId = typeof value.eventId === 'string' ? value.eventId : undefined
      const request = isRecord(value.request) ? value.request : undefined
      // The Agent identity travels on the frame, not in the request: the
      // gateway strips the live Agent and the cancellation signal before the
      // request crosses the wire. For a top-level session that identity is the
      // session id, which is what the phone pairs its answer with.
      const agentId = typeof value.agentId === 'string' ? value.agentId : undefined
      if (!eventId || !request || !agentId) return
      const pending = parsePendingQuestion(eventId, { ...request, sessionId: agentId })
      if (pending) this.pendingQuestions.set(eventId, pending)
      return
    }
    if (value.type === 'cancel' && typeof value.eventId === 'string') {
      this.pendingQuestions.delete(value.eventId)
    }
  }

  private assertPendingQuestion(rpcId: string, sessionId: string): PendingMobileQuestion {
    const pending = this.pendingQuestions.get(rpcId)
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('This question request is no longer pending.')
    }
    return pending
  }

  /**
   * Settle one forwarded question.
   *
   * `/api/respond` went with the ApiProxy. A forwarded event is now settled
   * through the Gateway's own unary endpoint, which pairs the event with the
   * client generation that received it — so an answer sent after a reconnect
   * is refused rather than applied to a stale question.
   */
  private async respondToQuestion(
    eventId: string,
    outcome: Record<string, unknown>,
  ): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    const clientId = this.eventClientId
    if (clientId === undefined) return { ok: false, error: 'Harness event stream is not connected.' }
    const settled = await this.invokeHarness(REMOTE_EVENT_RESULT_ENDPOINT, {
      clientId,
      eventId,
      outcome,
    })
    if (settled.ok) this.pendingQuestions.delete(eventId)
    return settled
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface WorkspaceSnapshot extends Record<string, unknown> {
  items: unknown[]
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.items)
}

function workspaceIdOf(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.workspaceId !== 'string' || value.workspaceId.length === 0) return undefined
  return value.workspaceId
}

/**
 * Fold one `workspace/follow` frame into the snapshot `workspace.list` serves.
 *
 * The Host has no unary workspace read. The opening frame is a full baseline;
 * later frames are increments. Increments that arrive before a baseline are
 * ignored, because there is no projection to apply them to.
 */
export function applyWorkspaceFollowFrame(snapshot: unknown, frame: Record<string, unknown>): unknown {
  if (frame.type === 'baseline' || frame.type === 'replace') return frame.value
  const current = isWorkspaceSnapshot(snapshot) ? snapshot : undefined
  if (current === undefined) return snapshot
  if (frame.type === 'upsert') {
    const workspaceId = workspaceIdOf(frame.workspace)
    if (workspaceId === undefined || !isRecord(frame.workspace)) return snapshot
    const items = current.items.slice()
    const index = items.findIndex(item => workspaceIdOf(item) === workspaceId)
    if (index >= 0) items[index] = frame.workspace
    else items.push(frame.workspace)
    return { ...current, items }
  }
  if (frame.type === 'remove') {
    const workspaceId = typeof frame.workspaceId === 'string' ? frame.workspaceId : undefined
    if (workspaceId === undefined || workspaceId.length === 0) return snapshot
    return {
      ...current,
      items: current.items.filter(item => workspaceIdOf(item) !== workspaceId),
    }
  }
  if (frame.type === 'order' && Array.isArray(frame.workspaceIds)) {
    const rank = new Map<string, number>()
    for (const [index, id] of frame.workspaceIds.entries()) {
      if (typeof id === 'string' && id.length > 0) rank.set(id, index)
    }
    const items = current.items.slice().sort((left, right) => {
      const leftRank = rank.get(workspaceIdOf(left) ?? '')
      const rightRank = rank.get(workspaceIdOf(right) ?? '')
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER)
    })
    return { ...current, items }
  }
  if (frame.type === 'archived' && Array.isArray(frame.archivedSessionIds)) {
    return { ...current, archivedSessionIds: frame.archivedSessionIds.slice() }
  }
  return snapshot
}

function requiredStringField(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== 'string' || !value[field]) {
    throw new Error(`Invalid ${field}.`)
  }
  return value[field]
}

function parsePendingQuestion(rpcId: string, payload: Record<string, unknown>): PendingMobileQuestion | undefined {
  if (typeof payload.sessionId !== 'string' || !Array.isArray(payload.questions)) return undefined
  const questions: MobileQuestion[] = []
  for (const item of payload.questions.slice(0, 20)) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.question !== 'string') continue
    const question: MobileQuestion = { id: item.id, question: item.question }
    if (typeof item.detail === 'string') question.detail = item.detail
    if (typeof item.header === 'string') question.header = item.header
    if (typeof item.multiSelect === 'boolean') question.multiSelect = item.multiSelect
    if (typeof item.intent === 'string') question.intent = item.intent
    if (Array.isArray(item.options)) {
      question.options = item.options.slice(0, 50).flatMap((option) => {
        if (!isRecord(option) || typeof option.label !== 'string') return []
        return [
          {
            label: option.label,
            ...(typeof option.description === 'string' ? { description: option.description } : {}),
          },
        ]
      })
    }
    questions.push(question)
  }
  if (!questions.length) return undefined
  return { rpcId, sessionId: payload.sessionId, questions }
}

function parseQuestionResponse(value: unknown): {
  rpcId: string
  sessionId: string
  answers: MobileQuestionAnswer[]
} {
  const rpcId = requiredStringField(value, 'rpcId')
  const sessionId = requiredStringField(value, 'sessionId')
  if (!isRecord(value) || !Array.isArray(value.answers) || value.answers.length > 20) {
    throw new Error('Invalid question answers.')
  }
  const answers = value.answers.map((item): MobileQuestionAnswer => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Array.isArray(item.selected)) {
      throw new Error('Invalid question answer.')
    }
    const selected = item.selected.map((label) => {
      if (typeof label !== 'string') throw new Error('Invalid selected option.')
      return label
    })
    if (selected.length > 50) throw new Error('Too many selected options.')
    return {
      id: item.id,
      selected,
      ...(typeof item.custom === 'string' && item.custom.trim() ? { custom: item.custom } : {}),
    }
  })
  return { rpcId, sessionId, answers }
}

function validateQuestionAnswers(pending: PendingMobileQuestion, answers: MobileQuestionAnswer[]): void {
  if (answers.length !== pending.questions.length) throw new Error('Every question needs an answer or skip.')
  const answerById = new Map(answers.map(answer => [answer.id, answer]))
  if (answerById.size !== answers.length) throw new Error('Duplicate question answer.')
  for (const question of pending.questions) {
    const answer = answerById.get(question.id)
    if (!answer) throw new Error('Every question needs an answer or skip.')
    const allowed = new Set((question.options ?? []).map(option => option.label))
    if (answer.selected.some(label => !allowed.has(label))) {
      throw new Error('Answer contains an unknown option.')
    }
    if (!question.multiSelect && answer.selected.length > 1) {
      throw new Error('Only one option can be selected.')
    }
  }
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timeout = setTimeout(done, milliseconds)
    function done(): void {
      clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
