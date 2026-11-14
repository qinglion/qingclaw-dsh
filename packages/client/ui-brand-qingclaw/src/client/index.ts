/** QingClaw occupants for the shell brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { QingClawBrandMark, QingClawBrandName } from './Brand.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

/** Required services: the UI slot registry and locale dictionary registry. */
export const inject = ['slots', 'locale']

/**
 * Fill every shell brand seat as one declaration-aware QingClaw occupant set.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }),
    'client-ui-brand-qingclaw: dictionaries',
  )
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, QingClawBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, QingClawBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, QingClawBrandMark)
      })))
}
