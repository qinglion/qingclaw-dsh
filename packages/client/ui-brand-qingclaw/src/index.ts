/**
 * QingClaw browser-brand plugin, node half. It supplies the brand splash that
 * the Web and Desktop carriers inject ahead of the shell boot page; the
 * browser half ships through the client export.
 * @module @deepseek-ai/dsh-client-ui-brand-qingclaw
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { bootSplashInjections } from './boot-splash.ts'

/**
 * Publish the first-frame rows of the QingClaw splash for every served page.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootSplashInjections())
  })
}
