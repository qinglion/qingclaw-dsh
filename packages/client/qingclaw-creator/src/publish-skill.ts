import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { BUNDLED_SKILL_RANK, type SkillCandidate } from '@deepseek-ai/dsh-skill'

const name = 'qingclaw-plugin-publish'
const sourceFile = fileURLToPath(new URL('../skills/qingclaw-plugin-publish/SKILL.md', import.meta.url))

/** Only the live account can supply the non-secret registry username embedded in the skill. */
async function resolveUsername(ctx: Context, signal: AbortSignal): Promise<string | undefined> {
  const session = await ctx.deepseekAccount.getPlatformSession()
  if (!session || signal.aborted) return
  const headers = new Headers(session.requestHeaders)
  headers.set('X-DSH-Auth-Token', session.token)
  headers.set('accept', 'application/json')
  const response = await fetch(new URL('/auth-api/v0/dsh/registry/identity', session.origin), {
    headers, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  })
  if (!response.ok) return
  const data = await response.json() as { username?: unknown }
  if (typeof data.username !== 'string' || !/^qc-[0-9]+$/.test(data.username)) return
  const current = await ctx.deepseekAccount.getPlatformSession()
  if (!signal.aborted && current?.origin === session.origin && current.token === session.token) return data.username
}

/** Expose the skill to all presets only while the current QingClaw account may publish. */
export function registerPublishSkill(ctx: Context): () => void {
  return ctx.skills.registerProvider((control) => {
    let cached: Promise<string | undefined> | undefined
    let timer: NodeJS.Timeout | undefined
    const invalidate = () => {
      clearTimeout(timer)
      cached = undefined
      control.invalidate()
    }
    // Changes of desktop grant immediately retire any discovery made by the previous login.
    void (async () => {
      for await (const event of ctx.deepseekAccount.watch(control.signal)) {
        if (event.type === 'credentials-changed') invalidate()
      }
    })().catch(() => { if (!control.signal.aborted) invalidate() })
    control.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
    const candidate: Omit<SkillCandidate, 'locator'> = {
      name, description: '把当前插件或工作台的确定版本发布到青狮 npm 私服。',
      provider: 'qingclaw-creator', source: 'bundled', rank: BUNDLED_SKILL_RANK,
      invocation: { modelInvocable: true, userInvocable: true },
    }
    return {
      name: candidate.provider,
      async list() {
        if (!cached) {
          cached = resolveUsername(ctx, control.signal).catch(() => undefined)
          // Re-evaluate online role changes even when the desktop grant stays the same.
          timer = setTimeout(invalidate, 120_000)
          timer.unref()
        }
        const username = await cached
        return username ? [{ ...candidate, locator: username }] : []
      },
      async get(selected, options) {
        const signal = options.signal ? AbortSignal.any([control.signal, options.signal]) : control.signal
        const username = await resolveUsername(ctx, signal).catch(() => undefined)
        if (!username || username !== selected.locator) { invalidate(); return }
        const raw = await readFile(sourceFile, { encoding: 'utf8', signal })
        const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
          + '\n\n调用 qingclaw_publish_package 时使用当前账号标识 `' + username
          + '`。如提示账号已切换，请重新加载技能并核对当前发布请求。'
        const { rank: _rank, ...summary } = candidate
        return { ...summary, content }
      },
    }
  })
}
