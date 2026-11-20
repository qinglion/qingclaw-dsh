/** Browser entry for the QingClaw Workbench global page. */

import type { Context } from '@deepseek-ai/cordis'
import qingclawWorkbenchRemote from '@qinglion/dsh-qingclaw-workbench/remote'
import { mountWorkbench } from './mount.ts'

/** Base Remote carrier and the two UI services required before mounting. */
export const inject = ['remote', 'slots', 'locale']

/** Mount the package-local generated Remote and its sidebar/main contributions. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountWorkbench(ctx, qingclawWorkbenchRemote)
}
