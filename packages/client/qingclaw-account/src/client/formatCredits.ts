/** Whole-credit display shared by the sidebar control and the composer banner. */

/**
 * Show whole credits; the gateway still reports fractions.
 * @param value - gateway credit balance, possibly fractional.
 * @returns grouped whole credits.
 */
export function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}
