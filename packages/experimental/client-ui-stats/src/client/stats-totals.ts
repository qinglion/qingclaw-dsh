/** Whole-session totals from the host projections that survive client paging. */

import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats/types'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { StatsTotals } from './stats-aggregate.ts'

/**
 * Map the whole-session stats and token-usage projections onto the totals row.
 * @param stats - whole-log turn/step and wall-time projection.
 * @param usage - whole-log prompt and output token projection.
 * @returns totals over the complete session, or null while either projection is absent.
 */
export function totalsFromProjections(
  stats: SessionStatsProjection | undefined,
  usage: TokenUsageProjection | undefined,
): StatsTotals | null {
  if (stats === undefined || usage === undefined) return null
  const context = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const cacheRead = usage.unreportedCacheReadAttempts === undefined ? usage.cacheReadTokens : null
  const active = stats.steps === 0 ? null : stats.llmMs + stats.toolMs
  return {
    turnCount: stats.turns,
    stepCount: stats.steps,
    context: stats.steps === 0 ? null : context,
    output: stats.steps === 0 ? null : usage.outputTokens,
    cacheHit: context > 0 && cacheRead !== null ? Math.min(1, cacheRead / context) : null,
    cacheRead: stats.steps === 0 ? null : cacheRead,
    cacheWrite: stats.steps === 0 ? null : usage.cacheWriteTokens,
    cacheContext: stats.steps === 0 || cacheRead === null ? null : context,
    ttft: stats.ttftSteps === 0 ? null : stats.ttftMs,
    ttftPending: 0,
    model: stats.steps === 0 ? null : stats.llmMs,
    modelPending: 0,
    tps: stats.steps > 0 && stats.decodeMs > 0 ? stats.decodeTokens / (stats.decodeMs / 1_000) : null,
    tool: stats.steps === 0 ? null : stats.toolMs,
    toolPending: 0,
    toolWall: stats.steps === 0 ? null : stats.toolMs,
    // Whole-session wall is not projected yet; model + tool is the documented substitute.
    wall: active,
  }
}
