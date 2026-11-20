import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'

/** Refresh the signed-in account once after nearby completed turns that actually used its model. */
export function installTurnUsageRefresh(ctx: Context, provider: string): void {
  const turns = new WeakMap<object, { account: Promise<PlatformSession | null>; used: boolean }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: PlatformSession | undefined
  let closed = false
  const schedule = (account: PlatformSession) => {
    latest = account
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      const target = latest
      latest = undefined
      if (target) void ctx.deepseekAccount.refreshUsage(target.token).catch(() => {})
    }, 300)
    timer.unref()
  }
  ctx.effect(() => () => {
    closed = true
    clearTimeout(timer)
    latest = undefined
  }, 'llm-qingclaw-account: completed turn usage')
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      turns.set(session, { account: ctx.deepseekAccount.getPlatformSession().catch(() => null), used: false })
      return
    }
    const turn = turns.get(session)
    if (!turn) return
    if (event.type === 'assistant/message' && session.requestContext()?.provider === provider) turn.used = true
    if (event.type !== 'turn/end') return
    turns.delete(session)
    if (!turn.used || (event.data.reason.kind !== 'completed' && event.data.reason.kind !== 'max-tokens')) return
    void turn.account.then(async (account) => {
      if (!account) return
      const current = await ctx.deepseekAccount.getPlatformSession()
      if (!closed && current?.token === account.token && current.origin === account.origin) schedule(account)
    }).catch(() => {})
  })
}
