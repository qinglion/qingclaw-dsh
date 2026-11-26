/** Identity tier resolution from Platform's entitlement plan. */
import { expect, it } from 'vitest'
import type { AccountProfile } from '@deepseek-ai/dsh-deepseek-account/types'
import { accountPlanLabelKey, accountPlanTier } from '../src/client/account-plan.ts'

function profileOf(plan?: string, subscriptionActive?: boolean): AccountProfile {
  return {
    id: null, name: null, contact: null,
    ...plan === undefined ? {} : { plan },
    ...subscriptionActive === undefined ? {} : { subscriptionActive },
  }
}

it('shows no tier when the deployment supplies no plan', () => {
  expect(accountPlanTier(undefined)).toBeUndefined()
  expect(accountPlanTier(profileOf())).toBeUndefined()
})

it('shows the free tier for a free plan', () => {
  expect(accountPlanTier(profileOf('free'))).toBe('free')
})

it.each(['pro', 'team'] as const)('shows the %s tier while the subscription runs', (plan) => {
  expect(accountPlanTier(profileOf(plan, true))).toBe(plan)
  expect(accountPlanTier(profileOf(plan))).toBe(plan)
})

it.each(['pro', 'team'] as const)('returns the %s identity to the free tier after the subscription lapses', (plan) => {
  expect(accountPlanTier(profileOf(plan, false))).toBe('free')
})

it('leaves an unknown plan unlabeled rather than mislabeling it', () => {
  expect(accountPlanTier(profileOf('business', true))).toBeUndefined()
})

it.each([['free', 'planFree'], ['pro', 'planPro'], ['team', 'planTeam']] as const)(
  'labels the %s tier with its dictionary key', (tier, key) => {
    expect(accountPlanLabelKey(tier)).toBe(key)
  })
