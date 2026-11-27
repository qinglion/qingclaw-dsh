/** The Platform query parameter that asks a page to follow the browser appearance. */
const THEME_PARAMETER = 'theme'

/** Value Platform reads for that parameter: the palette this browser reports as the system one. */
export const SYSTEM_THEME_REQUEST = 'system'

/**
 * Ask a Platform page to follow the appearance of the browser showing it. Desktop
 * publishes its theme through `nativeTheme.themeSource`, which Chromium reports to
 * every web contents as `prefers-color-scheme`; naming the system keeps a palette
 * the visitor stored in that browser's `qingclaw_theme` cookie from overriding the
 * application. Desktop never names light or dark itself, and the stored choice
 * stays put for the visitor's own browsing.
 * @param url - absolute URL about to be opened.
 * @param platformOrigin - Platform deployment origin for this build, when known.
 * @returns the URL asking for the system palette, or the input when it addresses
 *   another origin.
 */
export function withSystemTheme(url: string, platformOrigin: string | undefined): string {
  if (platformOrigin === undefined) return url
  let parsed: URL
  try { parsed = new URL(url) } catch {
    // A destination the shell cannot parse is not a Platform URL.
    return url
  }
  let origin: string
  try { origin = new URL(platformOrigin).origin } catch { return url }
  if (parsed.origin !== origin) return url
  parsed.searchParams.set(THEME_PARAMETER, SYSTEM_THEME_REQUEST)
  return parsed.href
}
