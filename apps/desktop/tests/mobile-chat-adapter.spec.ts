import { describe, expect, it, vi } from 'vitest'
import { MobileChatStream, mobileChatRpc } from '../src/mobile/mobile-chat-adapter.ts'

const sessionId = 'session-15'
const workspaceId = 'workspace-1'
const prompt = { sessionId, mode: 'steer', content: [{ type: 'text', text: '你好' }], clientTimeZone: 'Asia/Shanghai' }
const user = { type: 'event', event: { type: 'user/message', seq: 4, time: 500,
  surfaceOp: 'append', data: { content: prompt.content, source: { kind: 'user', rpcId: 'internal' } } } }
const assistant = { type: 'event', event: { type: 'assistant/message', data: { turn: 1, step: 2,
  message: { content: [{ type: 'text', text: '收到' }], source: { kind: 'model', replayState: 'internal' } }, stream: [] } } }

describe('paired chat adapter', () => {
  it('sends a text prompt through the normal Host prompt path and mints its request ID', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } })
    await expect(mobileChatRpc('session.prompt', prompt, undefined, invoke)).resolves.toEqual({ ok: true, value: { accepted: true } })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('session/prompt', { request: { ...prompt, requestId: expect.any(String) as unknown } })
  })

  it.each([
    ['session.create', { workspaceId, cwd: '/outside' }],
    ['session.prompt', { ...prompt, requestId: 'external' }],
    ['session.prompt', { ...prompt, content: [{ type: 'file', receiptId: 'external' }] }],
    ['session.selectModel', { sessionId, provider: 'provider', model: 'model', permissions: {} }],
    ['session.cancel', { sessionId: '/path/to/file' }],
    ['session.history', { sessionId, maxMessages: 500 }],
    ['settings/mutate', {}],
  ])('refuses unsupported mobile fields or operations for %s', async (method, input) => {
    const invoke = vi.fn()
    await expect(mobileChatRpc(method, input, undefined, invoke)).resolves.toMatchObject({ ok: false })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('returns workspace labels, membership and native preset values in phone shape', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, value: 'standard' })
    const items = [{ workspaceId, title: '工作区', sessionIds: [sessionId] }]
    expect(await mobileChatRpc('workspace.list', {}, { items: [{ ...items[0], path: '/device' }], archivedSessionIds: [] }, invoke))
      .toEqual({ ok: true, value: { items, archivedSessionIds: [] } })
    expect(await mobileChatRpc('agentPreset.select', { sessionId, agentPreset: 'standard' }, undefined, invoke))
      .toEqual({ ok: true, value: { agentPreset: 'standard' } })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('agentPresets/select', { agentId: sessionId, agentPreset: 'standard' })
  })

  it('returns presentation history when a cold session has no cached list watermark', async () => {
    const invoke = vi.fn((endpoint: string) => Promise.resolve({ ok: true, value: endpoint === 'session/page'
      ? { records: [user, { type: 'event', event: { type: 'system/message', data: { secret: 'hidden' } } }, assistant], hasMore: true }
      : { values: { title: '历史', other: 'hidden' } } }))
    const reply = await mobileChatRpc('session.history', { sessionId }, undefined, invoke)
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['session/page', 'session/projections'])
    expect(reply.value).toMatchObject({ events: [
      { event: { type: 'user/message', data: { source: { kind: 'user' }, content: prompt.content } } },
      { event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '收到' }] } } } },
    ], hasMore: true, projections: { values: { title: '历史' } } })
    expect(JSON.stringify(reply)).not.toMatch(/hidden|internal/)
  })

  it('maps active text in a reconnect baseline and subsequent native chunks to the same step', () => {
    const stream = new MobileChatStream()
    const attempt = { attemptId: 'attempt', turn: 1, step: 2 }
    const snapshot = stream.accept({ type: 'snapshot', header: { cwd: '/device' }, records: [user],
      assistantStream: { activeAttempt: { ...attempt, stream: [{ type: 'text-chunks', index: 0, texts: ['收', '到'] }] } } })
    expect(snapshot).toMatchObject({ records: [expect.anything(), { event: { type: 'assistant/chunk', data: {
      turn: 1, step: 2, chunk: { type: 'text-delta', text: '收到' },
    } } }] })
    const frame = { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', index: 2,
      chunk: { type: 'text-delta', index: 0, text: '了' } } }
    expect(stream.accept(frame)).toMatchObject({ event: { data: { turn: 1, step: 2, chunk: { text: '了' } } } })
    expect(stream.accept({ type: 'assistant-stream', frame: { type: 'end', attemptId: 'attempt' } })).toBeUndefined()
    expect(stream.accept(frame)).toBeUndefined()
    expect(JSON.stringify(snapshot)).not.toContain('/device')
  })
})

it('publishes a turn failure from history and follow without forwarding provider diagnostics', async () => {
  const ended = { type: 'event', event: { type: 'turn/end', seq: 9, data: { turn: 1, reason: {
    kind: 'error', error: { code: 'NOT_FOUND', status: 404, message: 'Model not exist', requestId: 'provider-internal' },
  } } } }
  const stream = new MobileChatStream()
  const expected = { type: 'event', event: { type: 'turn/end', seq: 9, data: { turn: 1, reason: {
    kind: 'error', error: { code: 'NOT_FOUND', status: 404, message: 'Model not exist' },
  } } } }
  expect(stream.accept(ended)).toEqual(expected)
  const history = await mobileChatRpc('session.history', { sessionId }, undefined,
    endpoint => Promise.resolve({ ok: true, value: endpoint === 'session/page' ? { records: [ended] } : null }))
  expect(history.value).toMatchObject({ events: [expected] })
})
