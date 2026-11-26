// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { expect, it, onTestFinished, vi } from 'vitest'
import { NS } from '../src/client/locales.ts'
import { PANEL_ID, registerWorkbenchUi } from '../src/client/mount.ts'

const { pluginStore, createStore } = vi.hoisted(() => {
  const pluginStore = {
    load: vi.fn(async () => []), subscribe: vi.fn(() => () => {}), dispose: vi.fn(),
    notice: vi.fn(() => undefined), dismissNotice: vi.fn(),
  }
  return { pluginStore, createStore: vi.fn(() => pluginStore) }
})
vi.mock('../src/client/workbench-plugin-store.ts', () => ({ createWorkbenchPluginStore: createStore }))

async function bench() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  await ctx.plugin(SlotRegistry)
  ctx.provide('remote', {} as never)
  // The account feature owns the page where the plan is bought; the market only asks for it.
  const openTopUp = vi.fn()
  ctx.provide('accountUi', { getSnapshot: () => ({ view: undefined, failed: false }) } as never)
  ctx.provide('qingclawPlatform', { open: openTopUp } as never)
  const declare = () => ctx.slots.register({
    name: 'root',
    children: {
      main: { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, declare, openTopUp }
}

it('registers one transactional sidebar/main pair and removes both with its owner', async () => {
  const subject = await bench()
  const disposeHoles = subject.declare()
  const fiber = subject.ctx.plugin({
    inject: ['remote', 'slots', 'locale', 'qingclawPlatform'],
    apply: registerWorkbenchUi,
  })
  await fiber
  const main = subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)
  const sidebar = subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)
  expect(main).toMatchObject({ locale: NS })
  expect(sidebar).toMatchObject({ locale: NS, options: { order: -20 } })
  expect(subject.ctx.locale.bind(NS)('panel')).toBe('工作台')
  const injected = (main?.inject as () => {
    pluginStore: typeof pluginStore
    openSubscriptionPage: (onReturned?: () => void) => void
  })()
  expect(injected.pluginStore).toBe(pluginStore)
  const returned = vi.fn()
  injected.openSubscriptionPage(returned)
  expect(subject.openTopUp).toHaveBeenCalledWith('top-up', returned)
  expect(createStore).toHaveBeenCalledWith(expect.anything())

  // The shell overlay owns the failure toast, so leaving the panel cannot drop it.
  const overlay = subject.ctx.slots.entries('shell.overlay').find(entry => entry.options.id === 'qingclaw-workbench-notice')
  expect(overlay).toMatchObject({ locale: NS })
  const notice = (overlay?.inject as () => {
    hooks: { notice: { getSnapshot(): unknown; subscribe: typeof pluginStore.subscribe } }
    dismissNotice(): void
  })()
  expect(notice.hooks.notice.getSnapshot()).toBeUndefined()
  expect(notice.hooks.notice.subscribe).toBe(pluginStore.subscribe)
  notice.dismissNotice()
  expect(pluginStore.dismissNotice).toHaveBeenCalledOnce()

  disposeHoles()
  expect(subject.ctx.slots.entries('shell.overlay')).toHaveLength(0)
  expect(subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)).toBeUndefined()
  expect(subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)).toBeUndefined()
  subject.declare()
  await Promise.resolve()
  expect(subject.ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID)).toBeDefined()
  expect(subject.ctx.slots.entries('sidebar.panellist').find(entry => entry.options.id === PANEL_ID)).toBeDefined()

  await fiber.dispose()
  expect(pluginStore.dispose).toHaveBeenCalledOnce()
  expect(subject.ctx.locale.bind(NS)('panel')).toBe('panel')
})
