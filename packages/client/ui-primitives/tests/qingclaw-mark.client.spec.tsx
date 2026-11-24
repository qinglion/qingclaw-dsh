// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QingClawMark, QINGCLAW_MARK_VIEWBOX } from '../src/QingClawMark.tsx'

afterEach(cleanup)

/** Root svg element of a rendered mark. */
function markRoot(container: HTMLElement): Element {
  const root = container.firstElementChild
  if (root === null) throw new Error('mark rendered no root element')
  return root
}

describe('QingClawMark', () => {
  it('draws the two-layer mark in the family palette', () => {
    const root = markRoot(render(<QingClawMark />).container)
    expect(root.tagName.toLowerCase()).toBe('svg')
    expect(root.getAttribute('viewBox')).toBe(`0 0 ${QINGCLAW_MARK_VIEWBOX} ${QINGCLAW_MARK_VIEWBOX}`)
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('focusable')).toBe('false')
    expect(root.querySelectorAll('path')).toHaveLength(5)
    expect(root.querySelectorAll('[fill="#4BB6B0"]')).toHaveLength(1)
    expect(root.querySelectorAll('[fill="#48707A"]')).toHaveLength(2)
  })

  it('fills the caller box unless a square edge is requested', () => {
    const sized = markRoot(render(<QingClawMark size={24} className="slot" />).container)
    expect(sized.getAttribute('width')).toBe('24')
    expect(sized.getAttribute('height')).toBe('24')
    expect(sized.getAttribute('class')).toBe('slot')
    const filled = markRoot(render(<QingClawMark />).container)
    expect(filled.getAttribute('width')).toBe('100%')
    expect(filled.getAttribute('height')).toBe('100%')
  })

  it('wraps the layers in the beat and notch drivers only while animated', () => {
    const still = markRoot(render(<QingClawMark />).container)
    expect(still.querySelectorAll('g[class]:not([class=""])')).toHaveLength(0)
    const alive = markRoot(render(<QingClawMark animated />).container)
    const drivers = [...alive.querySelectorAll('g[class]:not([class=""])')].map(node => node.getAttribute('class'))
    expect(drivers).toHaveLength(2)
    expect(drivers[0]).not.toBe('')
    expect(drivers[0]).not.toBe(drivers[1])
    expect(alive.querySelector('[fill="#4BB6B0"]')).not.toBeNull()
    expect(alive.querySelectorAll('path')).toHaveLength(5)
  })
})
