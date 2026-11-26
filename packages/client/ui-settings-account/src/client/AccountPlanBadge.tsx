/** Identity pill shared by the settings card and the sidebar launcher. */
import type { AccountPlanTier } from './account-plan.ts'
import css from './AccountPlanBadge.module.css'

/**
 * @param props.tier - resolved identity tier, which selects the treatment.
 * @param props.label - localized tier label.
 * @returns the identity pill.
 */
export function AccountPlanBadge({ tier, label }: { tier: AccountPlanTier; label: string }) {
  return <span className={css.badge} data-tier={tier}>{label}</span>
}
