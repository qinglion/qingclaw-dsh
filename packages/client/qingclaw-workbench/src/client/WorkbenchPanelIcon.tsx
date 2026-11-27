/** Sidebar glyph for the QingClaw Workbench global page. */

import { useState, type ReactNode } from 'react'
import { IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './WorkbenchPanelIcon.module.css'

type PanelIconProps = PropsRuntime<'sidebar.panellist'> & { readonly iconUrl?: string }

/** Render the workbench logo declared by the catalog, or the Workbench sparkle when it has none. */
export function WorkbenchPanelIcon({ size, iconUrl }: PanelIconProps): ReactNode {
  const [failed, setFailed] = useState<string>()
  if (!iconUrl || failed === iconUrl) return <IconSparkleRegular size={size} />
  return <span className={css.frame} style={{ width: size, height: size }}>
    <img src={iconUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(iconUrl)} />
  </span>
}

/** Bind one installed workbench's logo to the sidebar launcher registered for it. */
export function workbenchPanelIcon(iconUrl?: string): (props: PanelIconProps) => ReactNode {
  return props => <WorkbenchPanelIcon {...props} {...(iconUrl ? { iconUrl } : {})} />
}
