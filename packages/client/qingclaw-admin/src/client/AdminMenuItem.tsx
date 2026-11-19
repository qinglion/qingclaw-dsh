import { IconSettingsOutlineMedium, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'

type Props = PropsRuntime<'settings.launcher.actions'> & PropsLocale<'qingclaw.admin'>
  & InjectFace<{ role: 'admin' | 'creator'; openPanel: () => void }>

/** Select the account's management panel and close the account menu. */
export function AdminMenuItem({ t, role, onDismiss, openPanel }: Props) {
  return <MenuItemButton icon={<IconSettingsOutlineMedium size={16} />}
    onSelect={() => { onDismiss(); openPanel() }}>
    {t(role === 'admin' ? 'admin' : 'creator')}
  </MenuItemButton>
}
