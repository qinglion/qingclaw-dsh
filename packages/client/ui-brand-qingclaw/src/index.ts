/**
 * QingClaw browser-brand plugin, node half. It supplies the brand splash that
 * the Web and Desktop carriers inject ahead of the shell boot page; the
 * browser half ships through the client export.
 * @module @deepseek-ai/dsh-client-ui-brand-qingclaw
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BOOT_SPLASH_MIN_MS, BOOT_SPLASH_TIMEOUT_MS, bootSplashInjections } from './boot-splash.ts'

/** Splash timing accepted from cordis.yml. */
export interface Config {
  /** Minimum time the splash stays on screen, in milliseconds. */
  minVisibleMs: number
  /** Absolute cap before the splash retires, in milliseconds. */
  timeoutMs: number
}

/** Validated schema for {@link Config}; a row without config keeps both defaults. */
export const Config = z.object({
  minVisibleMs: z.number().step(1).min(0).max(10_000).default(BOOT_SPLASH_MIN_MS),
  timeoutMs: z.number().step(1).min(1_000).max(180_000).default(BOOT_SPLASH_TIMEOUT_MS),
})

/**
 * Publish the first-frame rows of the QingClaw splash for every served page.
 * @param ctx - Host plugin context.
 * @param config - Validated splash timing.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootSplashInjections({
      minVisibleMs: config.minVisibleMs,
      timeoutMs: config.timeoutMs,
    }))
  })
}
