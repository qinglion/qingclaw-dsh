import { randomUUID } from 'node:crypto'

type Fields = Record<string, unknown>
type Result = { ok: boolean; value?: unknown; error?: string }
type Invoke = (endpoint: string, args: Fields) => Promise<Result>

export const mobileChatMethods = new Set([
  'agentPreset.list', 'agentPreset.select', 'session.list', 'session.models', 'session.selectModel',
  'session.create', 'session.prompt', 'session.cancel', 'session.history', 'workspace.list',
])

function record(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Fields : {}
}

function rows(value: unknown): Fields[] {
  return Array.isArray(value) ? value.map(record) : []
}

function valid(fields: Fields, ...keys: string[]): void {
  if (Object.keys(fields).some(key => !keys.includes(key))) throw new Error('Unsupported mobile request fields.')
}

export function isMobileResourceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-][a-zA-Z0-9_.:-]{0,255}$/.test(value)
}

function id(fields: Fields, key: string): string {
  const value = fields[key]
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Invalid ' + key + '.')
  }
  if ((key === 'sessionId' || key === 'workspaceId') && !isMobileResourceId(value)) throw new Error('Invalid ' + key + '.')
  return value
}

function project(fields: Fields, ...keys: string[]): Fields {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(fields, key)).map(key => [key, fields[key]]))
}

function selection(value: unknown): Fields {
  return project(record(value), 'provider', 'model', 'reasoningEffort')
}

function projections(value: unknown): Fields {
  const source = record(record(value).values)
  const selected = record(source.modelSelection).next
  return {
    values: {
      ...project(source, 'title', 'agentPreset'),
      ...(selected ? { modelSelection: { next: selection(selected) } } : {}),
      todos: rows(source.todos).map(todo => project(todo, 'content', 'status')),
    },
  }
}

function sessionSummary(item: Fields): Fields {
  return {
    ...project(item, 'sessionId', 'updatedAt', 'blank', 'running'),
    agentPreset: record(record(item.projections).values).agentPreset,
    projections: projections(item.projections),
  }
}

function content(value: unknown): Fields[] {
  return rows(value).flatMap((part) => {
    if (part.type === 'text' || part.type === 'reasoning') return [project(part, 'type', 'text')]
    if (part.type === 'tool-call') return [project(part, 'type', 'name', 'id')]
    return []
  })
}

/** Only the conversation presentation crosses the device boundary. */
function mobileEvent(entry: Fields): Fields | undefined {
  const event = record(entry.event)
  if (event.surfaceOp && event.surfaceOp !== 'append') return undefined
  const d = record(event.data)
  const step = project(d, 'turn', 'step')
  let data: Fields
  switch (event.type) {
    case 'user/message':
      if (record(d.source).kind !== 'user') return undefined
      data = {
        source: { kind: 'user' }, content: content(d.content),
        canResendText: Array.isArray(d.content) && d.content.length === 1 && record(d.content[0]).type === 'text',
      }
      break
    case 'assistant/message':
      data = { ...step, message: { content: content(record(d.message).content) } }
      break
    case 'turn/start':
      data = step
      break
    case 'turn/end': {
      const reason = record(d.reason)
      const failure = record(reason.error)
      data = { ...step, reason: reason.kind === 'error'
        ? { kind: 'error', error: { ...project(failure, 'code', 'status'),
          ...(typeof failure.message === 'string' ? { message: failure.message.slice(0, 2048) } : {}) } }
        : project(reason, 'kind') }
      break
    }
    case 'tool/call':
      data = { ...step, ...project(d, 'name', 'callId') }
      break
    case 'tool/result':
      data = { ...step, message: { content: rows(record(d.message).content)
        .filter(part => part.type === 'tool-result').map(part => project(part, 'type', 'toolCallId', 'isError')) } }
      break
    case 'model/selection':
      data = selection(d)
      break
    default:
      return undefined
  }
  return { type: 'event', event: { ...project(event, 'type', 'time', 'seq'), data } }
}

function mobileEvents(records: unknown): Fields[] {
  return rows(records).map(mobileEvent).filter((entry): entry is Fields => entry !== undefined)
}

function textPrompt(fields: Fields): Fields {
  valid(fields, 'sessionId', 'mode', 'content', 'clientTimeZone')
  if (fields.mode !== 'queue' && fields.mode !== 'steer') throw new Error('Invalid prompt mode.')
  const parts = rows(fields.content)
  const [part] = parts
  if (parts.length !== 1 || part === undefined) throw new Error('Enter a text message.')
  valid(part, 'type', 'text')
  if (part.type !== 'text' || typeof part.text !== 'string' || !part.text.trim()) throw new Error('Enter a text message.')
  const zone = fields.clientTimeZone
  if (zone !== undefined && (typeof zone !== 'string' || zone.length > 128 || !/^[A-Za-z0-9_+/:-]+$/.test(zone))) {
    throw new Error('Invalid time zone.')
  }
  return { requestId: randomUUID(), sessionId: id(fields, 'sessionId'), mode: fields.mode,
    content: [{ type: 'text', text: part.text }], ...(zone ? { clientTimeZone: zone } : {}) }
}

/** Translate the paired phone's fixed chat vocabulary to the local Host. */
export async function mobileChatRpc(method: string, payload: unknown, workspaceSnapshot: unknown, invoke: Invoke): Promise<Result> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return { ok: false, error: 'Invalid mobile request.' }
  const fields = record(payload)
  try {
    switch (method) {
      case 'workspace.list': {
        valid(fields)
        if (!Array.isArray(record(workspaceSnapshot).items)) return { ok: false, error: 'Harness workspaces are not loaded yet.' }
        return { ok: true, value: {
          items: rows(record(workspaceSnapshot).items).map(item => project(item, 'workspaceId', 'title', 'sessionIds')),
          archivedSessionIds: record(workspaceSnapshot).archivedSessionIds ?? [],
        } }
      }
      case 'session.list': {
        valid(fields)
        const result = await invoke('session/list', { _request: {} })
        if (!result.ok) return result
        return { ok: true, value: { items: rows(record(result.value).items).map(sessionSummary) } }
      }
      case 'session.history': {
        valid(fields, 'sessionId', 'maxMessages')
        const sessionId = id(fields, 'sessionId')
        const maxMessages = fields.maxMessages ?? 100
        if (typeof maxMessages !== 'number' || !Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > 100) {
          throw new Error('Invalid message window.')
        }
        const [page, current] = await Promise.all([
          invoke('session/page', { request: { address: { kind: 'session', sessionId }, maxMessages } }),
          invoke('session/projections', { request: { sessionId } }),
        ])
        if (!page.ok) return page
        if (!current.ok) return current
        const value = record(page.value)
        if (!Array.isArray(value.records)) throw new Error('Harness returned invalid session history.')
        return { ok: true, value: {
          events: mobileEvents(value.records), projections: projections(current.value), hasMore: value.hasMore === true,
        } }
      }
      case 'session.create':
        valid(fields, 'workspaceId')
        return await invoke('session/create', { request: { workspaceId: id(fields, 'workspaceId') } })
      case 'session.cancel':
        valid(fields, 'sessionId')
        return await invoke('session/cancel', { request: { sessionId: id(fields, 'sessionId') } })
      case 'session.prompt':
        return await invoke('session/prompt', { request: textPrompt(fields) })
      case 'session.models':
        valid(fields, 'sessionId')
        return await invoke('session/modelCatalog', {})
      case 'session.selectModel': {
        valid(fields, 'sessionId', 'provider', 'model', 'reasoningEffort')
        const request = { sessionId: id(fields, 'sessionId'), provider: id(fields, 'provider'), model: id(fields, 'model'),
          ...(fields.reasoningEffort === undefined ? {} : { reasoningEffort: id(fields, 'reasoningEffort') }) }
        return await invoke('session/selectModel', { request })
      }
      case 'agentPreset.list':
        valid(fields)
        return await invoke('agentPresets/list', {})
      case 'agentPreset.select': {
        valid(fields, 'sessionId', 'agentPreset')
        const result = await invoke('agentPresets/select', { agentId: id(fields, 'sessionId'), agentPreset: id(fields, 'agentPreset') })
        if (!result.ok) return result
        return { ok: true, value: { agentPreset: result.value } }
      }
      default:
        return { ok: false, error: 'RPC method is not available on mobile.' }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid mobile request.' }
  }
}

interface Attempt { attemptId: string; turn: number; step: number }

/** One projection per SSE connection. Transient text is correlated to its own attempt. */
export class MobileChatStream {
  private attempt: Attempt | undefined

  private start(value: Fields): void {
    this.attempt = typeof value.attemptId === 'string' && typeof value.turn === 'number' && typeof value.step === 'number'
      ? { attemptId: value.attemptId, turn: value.turn, step: value.step } : undefined
  }

  private delta(value: Fields): Fields | undefined {
    if (!this.attempt || (value.type !== 'text-delta' && value.type !== 'reasoning-delta') || typeof value.text !== 'string') return
    return { type: 'event', event: { type: 'assistant/chunk', data: {
      turn: this.attempt.turn, step: this.attempt.step, chunk: project(value, 'type', 'index', 'text'),
    } } }
  }

  accept(input: unknown): Fields | undefined {
    const value = record(input)
    if (value.type === 'snapshot') {
      const current = record(record(value.assistantStream).activeAttempt)
      this.start(current)
      const records = mobileEvents(value.records)
      for (const run of rows(current.stream)) {
        let delta: Fields | undefined
        if ((run.type === 'text-chunks' || run.type === 'reasoning-chunks') && Array.isArray(run.texts)) {
          delta = this.delta({ type: run.type === 'text-chunks' ? 'text-delta' : 'reasoning-delta', index: run.index, text: run.texts.join('') })
        } else if (run.type === 'chunk') delta = this.delta(record(run.chunk))
        if (delta) records.push(delta)
      }
      return { type: 'snapshot', records, projections: projections(value.projections), hasMore: value.hasMore === true }
    }
    if (value.type !== 'assistant-stream') return mobileEvent(value)
    const frame = record(value.frame)
    if (frame.type === 'start') this.start(frame)
    if (!this.attempt || this.attempt.attemptId !== frame.attemptId) return
    if (frame.type === 'chunk') return this.delta(record(frame.chunk))
    if (frame.type === 'end') this.attempt = undefined
  }
}
