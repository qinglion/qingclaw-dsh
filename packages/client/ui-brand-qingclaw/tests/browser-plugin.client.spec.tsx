// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { QingClawBrandMark, QingClawBrandName } from '../src/client/Brand.tsx'
import { apply, inject } from '../src/client/index.ts'
import { NS } from '../src/client/locales.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { cleanup() })

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
] as const

async function bench(declare = true) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const declareHoles = () => ctx.slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, declareHoles, disposeHoles }
}

describe('QingClaw browser-brand plugin', () => {
  it('keeps the host Loader entry inert and declares its two browser services', () => {
    expect(hostApply).not.toThrow()
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('fills all brand declarations as one disposable occupant set', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(1)
    expect(subject.ctx.slots.entries('sidebar.brand.name')[0]).toMatchObject({ locale: NS })
    expect(subject.ctx.locale.bind(NS)('brandName')).toBe('QingClaw')

    subject.disposeHoles?.()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(0)
    expect(subject.ctx.locale.bind(NS)('brandName')).toBe('brandName')
  })

  it('waits until every brand declaration exists', async () => {
    const subject = await bench(false)
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.ctx.slots.entries(hole)).toHaveLength(1)
  })

  it('renders the layered QingClaw mark at both requested sizes and localizes its name', () => {
    const mark = render(<QingClawBrandMark size={34} className="hero-mark" />)
    const svg = mark.container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('34')
    expect(svg?.classList.contains('hero-mark')).toBe(true)
    expect(svg?.querySelectorAll('path')).toHaveLength(5)
    expect(svg?.querySelector('[fill="#4BB6B0"]')).not.toBeNull()
    expect(svg?.querySelector('[fill="#48707A"]')).not.toBeNull()
    mark.rerender(<QingClawBrandMark size={24} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
    mark.unmount()

    const t: TranslateNS<typeof NS> = key => key === 'brandName' ? '青狮龙虾' : key
    render(<QingClawBrandName t={t} />)
    expect(screen.getByText('青狮龙虾')).toBeTruthy()
  })
})
