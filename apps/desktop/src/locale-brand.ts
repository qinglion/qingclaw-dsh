/** Distribution wording applied to the shipped Desktop dictionaries. */
import { QINGCLAW_DESKTOP_DISTRIBUTION } from './distribution.ts'
import type { DesktopMessages } from './locale.ts'

/** Language ids the shell ships. */
type Language = 'en' | 'zh' | 'ja' | 'es' | 'fr' | 'de' | 'ru' | 'pt'

/** One shipped dictionary per language. */
export type DesktopDictionaries = Readonly<Record<Language, DesktopMessages>>

/**
 * Apply this distribution's product names to the shipped copy.
 *
 * The dictionaries stay upstream text: every occurrence of the upstream command
 * name becomes the distribution's command, and the upstream product name becomes
 * the distribution's name. Chinese also carries the welcome line the brand owns.
 * @param raw - the dictionaries as the shell declares them.
 * @returns the dictionaries with this distribution's names.
 */
export function brandDictionaries(raw: DesktopDictionaries): DesktopDictionaries {
  const command = QINGCLAW_DESKTOP_DISTRIBUTION.protocol
  const rename = (messages: DesktopMessages, product: string): DesktopMessages =>
    Object.fromEntries(Object.entries(messages).map(([key, value]) => [
      key,
      value.replaceAll('DeepSeek Harness', product).replace(/\bdsh\b/gu, command),
    ])) as DesktopMessages
  return {
    en: rename(raw.en, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    zh: { ...rename(raw.zh, QINGCLAW_DESKTOP_DISTRIBUTION.productName), welcomeDescription: QINGCLAW_DESKTOP_DISTRIBUTION.welcome.description },
    ja: rename(raw.ja, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    es: rename(raw.es, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    fr: rename(raw.fr, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    de: rename(raw.de, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    ru: rename(raw.ru, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
    pt: rename(raw.pt, QINGCLAW_DESKTOP_DISTRIBUTION.shortName),
  }
}
