/**
 * This package's right-Sidebar page: the publish panel.
 *
 * The guide page offers it as an entry box, so it sits beside the other tools
 * on an empty right Sidebar. The page is not a resource viewer: it claims no
 * address and is opened by kind.
 */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconUploadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const PUBLISH_KIND = 'qingclaw-publish'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const PUBLISH_ID = '@qinglion/dsh-qingclaw-creator-publish'

/** The guide entry's glyph: publishing leaves this machine for the registry. */
const artwork = ({ size, className }: IconProps) => IconUploadOutlineRegular({ size, className })

/**
 * The publish type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function publishDefinition(t: TranslateNS<'qingclaw.creator'>): SidebarRightTabDefinition {
  return {
    id: PUBLISH_ID,
    kind: PUBLISH_KIND,
    priority: 'extension',
    title: () => t('publish'),
    guide: [{
      id: 'publish',
      order: 40,
      title: () => t('publish'),
      description: () => t('publishDescription'),
      icon: artwork,
    }],
  }
}
