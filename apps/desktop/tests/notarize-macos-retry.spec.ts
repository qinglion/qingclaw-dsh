/** Retry only Apple's transient notarization and stapling failures. */

import { describe, expect, it } from 'vitest'
import { retryTransientNotarization } from '../scripts/notarize-macos.mjs'

const lostConnection = new Error(
  'Failed to staple your application with code: 68\nError Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."',
)

const noWait = async (): Promise<void> => {}

describe('transient notarization retry', () => {
  it('repeats a lost ticket-service connection and returns the successful attempt', async () => {
    let calls = 0
    const result = await retryTransientNotarization(async () => {
      calls += 1
      if (calls === 1) throw lostConnection
      return 'accepted'
    }, { sleep: noWait })

    expect(result).toBe('accepted')
    expect(calls).toBe(2)
  })

  it('does not repeat a signing or credential failure', async () => {
    let calls = 0
    await expect(retryTransientNotarization(async () => {
      calls += 1
      throw new Error('code object is not signed at all')
    }, { sleep: noWait })).rejects.toThrow('not signed')

    expect(calls).toBe(1)
  })

  it('rethrows the last connection failure after the bounded attempts', async () => {
    let calls = 0
    const waits: number[] = []
    await expect(retryTransientNotarization(async () => {
      calls += 1
      throw lostConnection
    }, {
      attempts: 3,
      delayMs: 12_000,
      sleep: async (ms) => { waits.push(ms) },
    })).rejects.toThrow('network connection was lost')

    expect(calls).toBe(3)
    expect(waits).toEqual([12_000, 12_000])
  })
})
