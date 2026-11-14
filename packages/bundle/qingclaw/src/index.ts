/** QingClaw distribution policy layered over the upstream Web application. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'qingclaw-distribution'

/** Host services used to apply QingClaw policy to every live Agent. */
export const inject = ['agents', 'tools']

const WEB_SEARCH_TOOL = 'web_search'

/**
 * Hide inherited Web Search from one Agent while preserving every other tool.
 * Presets without Web Search need no restriction.
 * @param agentContext - Agent-scoped context that owns the restriction.
 * @param scope - Agent scope used to inspect its inherited preset tools.
 */
export function restrictQingClawWebSearch(agentContext: Context, scope: object): void {
  if (agentContext.tools.get(WEB_SEARCH_TOOL, scope) === undefined) return
  agentContext.tools.restrict({ deny: [WEB_SEARCH_TOOL] })
}

/**
 * Apply QingClaw-only Agent policy without replacing upstream preset declarations.
 * @param ctx - QingClaw bundle plugin context.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/created', ({ agent }) => {
    restrictQingClawWebSearch(agent.ctx, agent)
  })
  ctx.on('agent-preset/selected', (sessionId) => {
    const agent = ctx.agents.get(sessionId)
    if (agent !== undefined) restrictQingClawWebSearch(agent.ctx, agent)
  })
}
