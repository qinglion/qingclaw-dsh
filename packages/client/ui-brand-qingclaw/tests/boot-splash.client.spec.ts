// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOOT_SPLASH_FADE_MS, BOOT_SPLASH_ID, BOOT_SPLASH_STYLE, BOOT_SPLASH_TIMEOUT_MS, bootSplashInjections,
  bootSplashScript,
} from '../src/boot-splash.ts'

/**
 * Remove every `@keyframes` block, so only style rules remain for selector checks.
 * @param css - stylesheet text.
 * @returns the stylesheet without animation blocks.
 */
function withoutKeyframes(css: string): string {
  let result = ''
  let index = 0
  while (index < css.length) {
    const start = css.indexOf('@keyframes', index)
    if (start < 0) return result + css.slice(index)
    result += css.slice(index, start)
    let depth = 0
    let cursor = css.indexOf('{', start)
    if (cursor < 0) return result
    do {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') depth -= 1
      cursor += 1
    } while (depth > 0 && cursor < css.length)
    index = cursor
  }
  return result
}

/**
 * Selectors of every style rule that is not a keyframe step.
 * @param css - stylesheet text.
 * @returns trimmed selector lists, in source order.
 */
function selectors(css: string): string[] {
  return withoutKeyframes(css)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.endsWith('{') && !line.startsWith('@') && !line.startsWith('/*'))
    .map(line => line.slice(0, -1).trim())
}

/** Mount the splash the way the injected body script does. */
function mountSplash(): void {
  // The row is classic script text, so the spec evaluates that text against the
  // page globals instead of importing an equivalent function.
  runInNewContext(bootSplashScript(), { document, Date, setInterval, setTimeout, clearInterval })
}

/** Draw the shell boot page inside the application root. */
function drawShellBoot(): HTMLElement {
  const root = document.createElement('div')
  root.id = 'root'
  const boot = document.createElement('div')
  boot.dataset.dshBoot = ''
  const spinner = document.createElement('div')
  spinner.dataset.dshBootSpinner = ''
  boot.append(spinner)
  root.append(boot)
  document.body.append(root)
  return root
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('boot splash injections', () => {
  it('injects one head style followed by one body script', () => {
    const rows = bootSplashInjections()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ kind: 'style', text: BOOT_SPLASH_STYLE })
    expect(rows[1]).toMatchObject({ kind: 'script', placement: 'body' })
  })

  it('scopes every rule and animation to the splash element', () => {
    for (const selector of selectors(BOOT_SPLASH_STYLE)) {
      expect(selector, selector).toContain('#' + BOOT_SPLASH_ID)
    }
    for (const match of BOOT_SPLASH_STYLE.matchAll(/@keyframes ([\w-]+)/g)) {
      expect(match[1]).toMatch(/^qcb-/)
    }
  })

  it('keeps brand inks and refuses markup that would close its own element early', () => {
    expect(BOOT_SPLASH_STYLE).toContain('#4bb6b0')
    expect(BOOT_SPLASH_STYLE).toContain('#48707a')
    expect(BOOT_SPLASH_STYLE).not.toContain('</style')
    expect(bootSplashScript()).not.toContain('</script')
  })
})

describe('boot splash lifecycle', () => {
  it('mounts the brand splash before the shell boot page', () => {
    mountSplash()
    const splash = document.getElementById(BOOT_SPLASH_ID)
    expect(splash).not.toBeNull()
    expect(splash?.getAttribute('aria-busy')).toBe('true')
    expect(splash?.textContent).toContain('青狮龙虾')
    expect(splash?.textContent).toContain('正在唤醒青狮…')
    expect(splash?.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(splash?.querySelector('.qcb-name')?.getAttribute('aria-label')).toBe('青狮龙虾')
  })

  it('mounts once even when the script runs twice', () => {
    mountSplash()
    mountSplash()
    expect(document.querySelectorAll('#' + BOOT_SPLASH_ID)).toHaveLength(1)
  })

  it('stays while the shell keeps its boot page', () => {
    vi.useFakeTimers()
    mountSplash()
    drawShellBoot()
    vi.advanceTimersByTime(600)
    const splash = document.getElementById(BOOT_SPLASH_ID)
    expect(splash?.classList.contains('qcb-out')).toBe(false)
  })

  it('fades out and leaves when the application replaces the boot page', () => {
    vi.useFakeTimers()
    mountSplash()
    const root = drawShellBoot()
    vi.advanceTimersByTime(240)
    root.replaceChildren(document.createElement('main'))
    vi.advanceTimersByTime(240)
    const splash = document.getElementById(BOOT_SPLASH_ID)
    expect(splash?.classList.contains('qcb-out')).toBe(true)
    expect(splash?.getAttribute('aria-busy')).toBe('false')
    vi.advanceTimersByTime(BOOT_SPLASH_FADE_MS)
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull()
  })

  it('yields to the shell failure report', () => {
    vi.useFakeTimers()
    mountSplash()
    const root = drawShellBoot()
    root.querySelector('[data-dsh-boot]')?.replaceChildren(document.createElement('div'))
    vi.advanceTimersByTime(240)
    expect(document.getElementById(BOOT_SPLASH_ID)?.classList.contains('qcb-out')).toBe(true)
  })

  it('gives the screen back when no shell boot page ever appears', () => {
    vi.useFakeTimers()
    mountSplash()
    vi.advanceTimersByTime(BOOT_SPLASH_TIMEOUT_MS - 240)
    expect(document.getElementById(BOOT_SPLASH_ID)?.classList.contains('qcb-out')).toBe(false)
    vi.advanceTimersByTime(360)
    expect(document.getElementById(BOOT_SPLASH_ID)?.classList.contains('qcb-out')).toBe(true)
  })
})
