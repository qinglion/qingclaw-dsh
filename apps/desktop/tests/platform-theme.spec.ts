import { expect, it } from 'vitest'
import { withSystemTheme } from '../src/platform-theme.ts'

it('asks Platform pages to follow the appearance of the browser showing them', () => {
  expect(withSystemTheme('https://qingclaw.com/usage', 'https://qingclaw.com'))
    .toBe('https://qingclaw.com/usage?theme=system')
  expect(withSystemTheme('https://qingclaw.com/#download', 'https://qingclaw.com'))
    .toBe('https://qingclaw.com/?theme=system#download')
  // A destination that already carries a palette is rewritten, so no link pins one
  // over the application the visitor is looking at.
  expect(withSystemTheme('https://qingclaw.com/usage?theme=dark', 'https://qingclaw.com'))
    .toBe('https://qingclaw.com/usage?theme=system')
})

it('leaves other origins, unusable origins, and unknown deployments alone', () => {
  expect(withSystemTheme('https://payment.example/order', 'https://qingclaw.com'))
    .toBe('https://payment.example/order')
  expect(withSystemTheme('https://qingclaw.com.evil/usage', 'https://qingclaw.com'))
    .toBe('https://qingclaw.com.evil/usage')
  expect(withSystemTheme('https://qingclaw.com/usage', undefined))
    .toBe('https://qingclaw.com/usage')
  expect(withSystemTheme('not a url', 'https://qingclaw.com')).toBe('not a url')
  expect(withSystemTheme('https://qingclaw.com/usage', 'not a url'))
    .toBe('https://qingclaw.com/usage')
})
