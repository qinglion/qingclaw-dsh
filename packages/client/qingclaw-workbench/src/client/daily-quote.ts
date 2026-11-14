import type { WorkbenchLocaleKey } from './locales.ts'

const QUOTE_KEYS = [
  'quote1', 'quote2', 'quote3', 'quote4', 'quote5', 'quote6', 'quote7', 'quote8',
] as const satisfies readonly WorkbenchLocaleKey[]

/** Select one stable quote from the local calendar day without persisting legacy user state. */
export function dailyQuoteKey(now: Date): (typeof QUOTE_KEYS)[number] {
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
  const index = ((day % QUOTE_KEYS.length) + QUOTE_KEYS.length) % QUOTE_KEYS.length
  return QUOTE_KEYS[index] ?? 'quote1'
}
