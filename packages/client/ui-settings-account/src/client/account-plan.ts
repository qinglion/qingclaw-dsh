/** Identity tier derived from the Platform entitlement plan. */
import type { AccountProfile } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountKey } from './locales.ts'

/** Plan displayed beside the account identity; `free` covers the paid plans once they lapse. */
export type AccountPlanTier = 'free' | 'pro' | 'team'

/**
 * Resolve the identity tier a profile displays. An inactive paid plan reads as the free tier,
 * which is the identity Platform itself shows for a lapsed subscription.
 * @param profile - value of a ready profile read; undefined while the read is pending or failed.
 * @returns tier to display, or undefined when the deployment supplies no plan, which leaves current
 * upstream deployments without a badge.
 */
export function accountPlanTier(profile: AccountProfile | undefined): AccountPlanTier | undefined {
  switch (profile?.plan) {
    case 'free': return 'free'
    case 'pro': return profile.subscriptionActive === false ? 'free' : 'pro'
    case 'team': return profile.subscriptionActive === false ? 'free' : 'team'
    default: return undefined
  }
}

/**
 * @param tier - resolved identity tier.
 * @returns account locale key carrying the tier label.
 */
export function accountPlanLabelKey(tier: AccountPlanTier): AccountKey {
  if (tier === 'pro') return 'planPro'
  return tier === 'team' ? 'planTeam' : 'planFree'
}
