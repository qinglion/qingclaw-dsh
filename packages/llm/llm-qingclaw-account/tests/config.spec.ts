import { expect, it } from 'vitest'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { Config, DEFAULT_BASE_URL, plainOptions, resolveOptions } from '../src/config.ts'

it('defaults Chat Completions to QingClaw and keeps model listing at the gateway root', () => {
  const resolved = resolveOptions({})
  expect(resolved.protocol.baseURL).toBe('https://api.qingclaw.com/v1')
  expect(resolved.catalog).toEqual({ url: 'https://api.qingclaw.com/auth-api/v0/dsh/models', timeoutMs: 5_000, maxAgeMs: 600_000 })
  expect(resolveOptions({ baseURL: 'http://127.0.0.1:9/custom/messages' }).catalog.url).toBe('http://127.0.0.1:9/auth-api/v0/dsh/models')
})

it.each(['/anthropic', '/anthropic-key', '/anthropic-key/v1/'])('upgrades the saved QingClaw endpoint %s', (path) => {
  expect(resolveOptions({ baseURL: `https://api.qingclaw.com${path}` }).protocol.baseURL).toBe(DEFAULT_BASE_URL)
})

it('preserves a custom OpenAI-compatible deployment prefix', () => {
  const baseURL = 'https://gateway.example/tenant/v1'
  expect(resolveOptions({ baseURL }).protocol.baseURL).toBe(baseURL)
})

it.each([
  [{ modelTokenTimeoutMs: 0 }, /modelTokenTimeoutMs must be a positive finite number/],
  [{ modelTokenTimeoutMs: MAX_TIMER_DELAY_MS + 1 }, /modelTokenTimeoutMs must be a positive finite number/],
  [{ models: [] }, /models is not configurable/],
  [{ modelOverrides: { '': {} } }, /modelOverrides keys must be non-empty model ids/],
  [{ modelOverrides: { 'qwen-plus': { id: 'other' } } }, /modelOverrides\.qwen-plus sets "id"/],
])('rejects %j', (options, message) => {
  expect(() => { Reflect.apply(resolveOptions, undefined, [options]) }).toThrow(message)
})

it('reads current Config values and resolves declared overrides', () => {
  const options = plainOptions(Config({
    modelTokenTimeoutMs: 7,
    modelOverrides: { 'qwen-plus': { contextWindow: 9, inputModalities: [] } },
  }))
  expect(options).toMatchObject({
    modelTokenTimeoutMs: 7,
    modelOverrides: { 'qwen-plus': { contextWindow: 9 } },
  })
  expect(options).not.toHaveProperty('models')
})
