/** Ledger gate: a fork patch is registered, or the gate names it. */
import { describe, expect, it } from 'vitest'
import { checkLedger, globMatcher, type Ledger } from './verify-qingclaw-patches.ts'

const ledger: Ledger = {
  base: 'origin/master',
  entries: [
    { glob: 'apps/desktop/**', kind: 'distribution', intent: 'desktop wiring', exit: 'permanent' },
    { glob: 'packages/llm/**', kind: 'upstream-worthy', intent: 'catalog pricing', exit: 'after the upstream merge', pr: 'draft' },
  ],
}

describe('qingclaw patch ledger', () => {
  it('scopes a single star to one path segment', () => {
    expect(globMatcher('apps/desktop/**').test('apps/desktop/src/main.ts')).toBe(true)
    expect(globMatcher('apps/desktop/*').test('apps/desktop/src/main.ts')).toBe(false)
    expect(globMatcher('apps/desktop/*').test('apps/desktop/package.json')).toBe(true)
    expect(globMatcher('tsconfig*.json').test('tsconfig.base.json')).toBe(true)
    expect(globMatcher('packages/client/**').test('packages/clientx/a.ts')).toBe(false)
  })

  it('accepts a ledger that covers every changed path', () => {
    expect(checkLedger(['apps/desktop/src/main.ts', 'packages/llm/llm/src/index.ts'], ledger)).toEqual([])
  })

  it('names an unregistered patch, an empty intent, a stale row, and a nameless PR', () => {
    const failures = checkLedger(['apps/desktop/src/main.ts', 'packages/api/session-controller/src/index.ts'], {
      base: 'origin/master',
      entries: [
        ...ledger.entries,
        { glob: 'packages/client/locale/**', kind: 'feature', intent: ' ', exit: '' },
        { glob: 'packages/core/**', kind: 'upstream-worthy', intent: 'save', exit: 'after merge', pr: '' },
      ],
    })
    expect(failures).toContainEqual({ path: 'packages/api/session-controller/src/index.ts', reason: 'no ledger entry names this patch' })
    expect(failures).toContainEqual({ path: 'packages/client/locale/**', reason: 'ledger entry matches no patch' })
    expect(failures).toContainEqual({ path: 'packages/client/locale/**', reason: 'ledger entry states no intent' })
    expect(failures).toContainEqual({ path: 'packages/client/locale/**', reason: 'ledger entry states no exit condition' })
    expect(failures).toContainEqual({ path: 'packages/core/**', reason: 'upstream-worthy entry names no pull request' })
  })
})
