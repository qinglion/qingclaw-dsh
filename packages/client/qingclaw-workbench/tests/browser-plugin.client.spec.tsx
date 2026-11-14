// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { WorkbenchFeedResult } from '../src/types.ts'
import { NS } from '../src/client/locales.ts'
import { PANEL_ID, registerWorkbenchUi } from '../src/client/mount.ts'

const value: WorkbenchFeedResult = {
  source: 'network', stale: false,
  feed: { schemaVersion: 1, revision: '', latestVideos: [], featuredCourses: [],
    links: { allCourses: 'https://qingclaw.com/courses' } },
}

async function bench() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  await ctx.plugin(SlotRegistry)
  const getFeed = vi.fn().mockResolvedValue({ ok: true, value })
  ctx.provide('remote', { qingclawWorkbench: { getFeed } } as never)
  const declare = () => ctx.slots.register({
    name: 'root',
    children: {
      main: { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, declare, getFeed }
}

it('registers one transactional sidebar/main pair and removes both with its owner', async () => {
  const subject = await bench()
  const disposeHoles = subject.declare()
  const fiber = subject.ctx.plugin({
    inject: ['remote', 'slots', 'locale'],
    apply: registerWorkbenchUi,
  })
  await fiber
  const main = subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)
  const sidebar = subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)
  expect(main).toMatchObject({ locale: NS })
  expect(sidebar).toMatchObject({ locale: NS, options: { order: -20 } })
  expect(subject.ctx.locale.bind(NS)('panel')).toBe('青狮工作台')
  const injected = (main?.inject as () => { loadFeed: (refresh: boolean) => Promise<WorkbenchFeedResult> })()
  expect(await injected.loadFeed(true)).toBe(value)
  expect(subject.getFeed).toHaveBeenCalledWith(true)

  disposeHoles()
  expect(subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)).toBeUndefined()
  expect(subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)).toBeUndefined()
  subject.declare()
  await Promise.resolve()
  expect(subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)).toBeDefined()
  expect(subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)).toBeDefined()

  await fiber.dispose()
  expect(subject.ctx.locale.bind(NS)('panel')).toBe('panel')
})

it('unwraps typed Remote failures instead of exposing protocol result objects to the page', async () => {
  const subject = await bench()
  subject.declare()
  subject.getFeed.mockResolvedValueOnce({ ok: false, error: new Error('offline') })
  const fiber = subject.ctx.plugin({
    inject: ['remote', 'slots', 'locale'],
    apply: registerWorkbenchUi,
  })
  await fiber
  const main = subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)!
  const injected = (main.inject as () => { loadFeed: (refresh: boolean) => Promise<WorkbenchFeedResult> })()
  await expect(injected.loadFeed(false)).rejects.toThrow('offline')
})
