import type { Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { afterEach, expect, it, vi } from 'vitest'
import { registerPublishSkill } from '../src/publish-skill.ts'

afterEach(() => vi.unstubAllGlobals())

it('permits creator discovery, identifies the exact npm user on every load, and denies an earlier candidate after a role or user change', async () => {
  let token: string | undefined = 'grant-for-user'
  let username: string | undefined
  const signal = new AbortController(), invalidate = vi.fn()
  let provider!: SkillProvider
  const ctx = {
    skills: { registerProvider(factory: (control: SkillProviderControl) => SkillProvider) {
      provider = factory({ signal: signal.signal, invalidate })
      return () => signal.abort()
    } },
    deepseekAccount: {
      getPlatformSession: async () => token && { origin: 'https://platform.test', token, requestHeaders: {} },
      async *watch() { yield { type: 'snapshot' } },
    },
  } as unknown as Context
  const fetch = vi.fn(async () => username ? Response.json({ username }) : new Response(null, { status: 403 }))
  vi.stubGlobal('fetch', fetch)
  const unregister = registerPublishSkill(ctx)
  try {
    expect(await provider.list({})).toEqual([])
  } finally { unregister() }

  username = 'qc-11'
  const control = new AbortController()
  ctx.skills.registerProvider = (factory) => {
    provider = factory({ signal: control.signal, invalidate })
    return () => control.abort()
  }
  const stop = registerPublishSkill(ctx)
  try {
    const candidates = await provider.list({}) as SkillCandidate[]
    const candidate = candidates[0]!
    expect(candidate.name).toBe('qingclaw-plugin-publish')
    expect(JSON.stringify(candidate)).not.toContain('grant-for-user')
    const before = await provider.get(candidate, {})
    expect(before?.content).toContain('qc-11')
    expect(before?.content).toContain('qingclaw_publish_package')
    username = 'qc-17'
    expect(await provider.get(candidate, {})).toBeUndefined()
    const replacement = (await provider.list({}) as SkillCandidate[])[0]!
    expect((await provider.get(replacement, {}))?.content).toContain('qc-17')
    username = undefined
    expect(await provider.get(replacement, {})).toBeUndefined()
    token = undefined
    expect(await provider.list({})).toEqual([])
  } finally { stop() }
})
