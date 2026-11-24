/** Built-in account-menu feedback row: opens the external support questionnaire. */
import { IconPaperPlaneOutlineMedium, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'

/** Composed props of the built-in feedback row. */
export type FeedbackMenuItemProps = PropsRuntime<'settings.launcher.feedback'> & PropsLocale<'settings.account'> & InjectFace<Pick<AccountSectionInjected, 'contactUs'>>

/**
 * @param props - menu dismissal, localized copy, and the questionnaire opener.
 * @returns the default feedback menu row.
 */
export function FeedbackMenuItem({ onDismiss, contactUs, t }: FeedbackMenuItemProps) {
  return <MenuItemButton icon={<IconPaperPlaneOutlineMedium size={16} />} onSelect={() => { onDismiss(); contactUs() }}>
    {t('contactUs')}
  </MenuItemButton>
}
