// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningMark } from '../src/client/chat/RunningMark.tsx'

afterEach(cleanup)

describe('RunningMark', () => {
  it('renders the decorative product mark as the icon seat content', () => {
    const view = render(<RunningMark />)
    const icon = view.container.firstElementChild!
    expect(icon.tagName).toBe('SPAN')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.childElementCount).toBe(1)
    const svg = icon.firstElementChild!
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path')).toHaveLength(5)
    expect(view.container.querySelector('[style]')).toBeNull()
  })
})
