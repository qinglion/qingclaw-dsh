import { SHIPPED_LOCALE_IDS } from '../../../scripts/shipped-locales.ts'
import { describe, expect, it } from 'vitest'
import {
  en,
  formatDesktopMessage,
  resolveDesktopLocale,
  resolveDesktopStartupLocale,
  ja,
  zh,
  es,
  fr,
  de,
  ru,
  pt,
} from '../src/locale.ts'

import { brandDictionaries } from '../src/locale-brand.ts'

/** The shipped copy after this distribution's names are applied. */
const DICTIONARIES = brandDictionaries({ en, zh, ja, es, fr, de, ru, pt })

describe('desktop locale dictionaries', () => {
  it('uses the same concise Chinese configuration error in the toast and details', () => {
    for (const message of [zh.updateConfigurationRead, zh.updateConfigurationFormat, zh.updateConfigurationChannel]) {
      expect(message).toBe('配置文件异常，更新已暂停')
    }
  })

  it('ships baseline and Japanese keys and falls back for unsupported languages', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(Object.keys(ja)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('JA-jp').id).toBe('ja')
    // Branding is applied to the shipped copy: no upstream product name survives.
    for (const id of ['ja', 'zh-Hans-CN', 'en-US', 'it-IT'] as const) {
      const offenders = Object.entries(resolveDesktopLocale(id).messages)
        .filter(([, value]) => value.includes('DeepSeek Harness') || /\bdsh\b/u.test(value))
      expect(offenders.map(([key]) => key), id).toEqual([])
    }
    expect(resolveDesktopLocale('zh-Hans-CN').messages.welcomeDescription).toBe('律师 AI 助理，就用青狮龙虾')
  })

  it.each([
    ['es', 'es-MX', es], ['fr', 'fr-CA', fr], ['de', 'de-DE', de],
    ['ru', 'ru-RU', ru], ['pt', 'pt-BR', pt],
  ] as const)('resolves %s, preserves placeholders, and honors saved preferences', (id, tag, messages) => {
    expect(resolveDesktopLocale(tag.toUpperCase())).toEqual({ id, messages: DICTIONARIES[id] })
    expect(resolveDesktopStartupLocale(id, ['zh-CN']).id).toBe(id)
    expect(resolveDesktopStartupLocale(null, ['it-IT', tag, 'en-US']).id).toBe(id)
    expect(Object.keys(messages)).toEqual(Object.keys(en))
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const placeholders = (text: string): string[] => (text.match(/\{\w+\}/gu) ?? []).sort()
      expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it.each(SHIPPED_LOCALE_IDS)('resolves every shipped language %s without fallback', (id) => {
    expect(resolveDesktopLocale(id).id).toBe(id === 'zh' ? 'zh-CN' : id)
    expect(resolveDesktopStartupLocale(null, [id]).id).toBe(id === 'zh' ? 'zh-CN' : id)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('ja')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('ja')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('ja')
  })

})
