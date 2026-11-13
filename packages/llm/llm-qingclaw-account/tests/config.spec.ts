import { expect, it } from 'vitest'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { Config, DEFAULT_BASE_URL, plainOptions, resolveOptions } from '../src/config.ts'

it('defaults Messages to QingClaw and keeps model listing at the gateway root', () => {
  const resolved = resolveOptions({})
  expect(resolved.protocol.baseURL).toBe(DEFAULT_BASE_URL)
  expect(resolved.catalog).toEqual({ url: 'https://api.qingclaw.com/models', timeoutMs: 5_000, maxAgeMs: 600_000 })
  expect(resolveOptions({ baseURL: 'http://127.0.0.1:9/custom/messages' }).catalog.url).toBe('http://127.0.0.1:9/models')
})

it.each([
  [{ modelTokenTimeoutMs: 0 }, /modelTokenTimeoutMs must be a positive finite number/],
  [{ modelTokenTimeoutMs: MAX_TIMER_DELAY_MS + 1 }, /modelTokenTimeoutMs must be a positive finite number/],
  [{ models: [] }, /models is not configurable/],
  [{ modelOverrides: { '': {} } }, /modelOverrides keys must be non-empty model ids/],
  [{ modelOverrides: { 'deepseek-flash': { id: 'other' } } }, /modelOverrides\.deepseek-flash sets "id"/],
])('rejects %j', (options, message) => {
  expect(() => { Reflect.apply(resolveOptions, undefined, [options]) }).toThrow(message)
})

it('reads current Config values and resolves declared overrides', () => {
  const options = plainOptions(Config({
    modelTokenTimeoutMs: 7,
    modelOverrides: { 'deepseek-flash': { contextWindow: 9, inputModalities: [] } },
  }))
  expect(options).toMatchObject({
    modelTokenTimeoutMs: 7,
    modelOverrides: { 'deepseek-flash': { contextWindow: 9 } },
  })
  expect(options).not.toHaveProperty('models')
})
