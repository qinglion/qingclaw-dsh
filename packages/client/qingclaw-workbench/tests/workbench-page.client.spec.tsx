// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { WorkbenchPage, type WorkbenchPageProps } from '../src/client/WorkbenchPage.tsx'
import type { WorkbenchPluginItem, WorkbenchPluginStore } from '../src/client/workbench-plugin-store.ts'
import { NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: TranslateNS<typeof NS> = (key, values) => {
  const message = (zh as Record<string, string>)[key] ?? key
  return message.replace(/\{(\w+)\}/g, (token, name: string) => values?.[name]?.toString() ?? token)
}
const useLocale: WorkbenchPageProps['useLocale'] = selector => selector({ active: 'zh', locales: [], revision: 0 })
const media: WorkbenchPluginItem = {
  id: 'media', title: '自媒体工作台', description: '制作图文内容', author: '内容团队',
  category: '创作', version: '1.0.0', packageName: '@example/media',
  panelId: 'media', registry: 'https://npm.qingclaw.com/',
  installed: false, installable: true, openable: false, favorite: false,
  previewUrl: 'https://example.com/media-preview.png',
}
const notes: WorkbenchPluginItem = {
  ...media, id: 'notes', panelId: 'notes', title: '研究笔记', category: '研究', author: '研究组', packageName: '@example/notes',
  installed: true, installable: false, openable: true,
}

function setup(initial = [media, notes]) {
  let items = initial
  const update = (id: string, changes: Partial<WorkbenchPluginItem>) => {
    items = items.map(item => item.id === id ? { ...item, ...changes } : item)
  }
  const store = {
    load: vi.fn(async (_refresh?: boolean) => items),
    subscribe: vi.fn(() => () => {}),
    setFavorite: vi.fn((id: string, favorite: boolean) => update(id, { favorite })),
    install: vi.fn(async (id: string) => update(id, { installed: true, openable: true })),
    open: vi.fn(),
    readReadme: vi.fn(async (_id: string, _version: string, _language: string) => ({ markdown: '## 使用指南\n\n在灵感页新建素材。' })),
    dispose: vi.fn(),
  } satisfies WorkbenchPluginStore
  const page = () => render(<WorkbenchPage {...({ t, useLocale, pluginStore: store } as unknown as WorkbenchPageProps)} />)
  return { store, page }
}

it('keeps project creation out of the market', async () => {
  const { page } = setup([])
  page()
  await screen.findByText(zh.emptyMarket)
  expect(screen.queryByRole('button', { name: '制作工作台' })).toBeNull()
})

it('filters by author and category, then clears unmatched searches', async () => {
  const { page } = setup()
  page()
  expect(await screen.findByRole('article', { name: media.title })).toBeTruthy()
  const search = screen.getByRole('searchbox', { name: zh.search })
  fireEvent.change(search, { target: { value: '内容团队' } })
  expect(screen.queryByRole('article', { name: notes.title })).toBeNull()
  fireEvent.change(search, { target: { value: '' } })
  fireEvent.change(screen.getByRole('combobox', { name: zh.category }), { target: { value: '研究' } })
  expect(screen.queryByRole('article', { name: media.title })).toBeNull()
  fireEvent.change(search, { target: { value: '无匹配项' } })
  expect(screen.getByText(zh.noMatches)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.resetFilters }))
  expect(screen.getAllByRole('article')).toHaveLength(2)
})

it('favorites a listing, installs it, and opens the installed workbench', async () => {
  const { store, page } = setup()
  page()
  let card = within(await screen.findByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: zh.favorite }))
  await waitFor(() => expect(card.getByRole('button', { name: zh.unfavorite })).toBeTruthy())
  fireEvent.click(screen.getByRole('tab', { name: zh.favorites }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.click(card.getByRole('button', { name: zh.install }))
  await waitFor(() => expect(card.getByRole('button', { name: zh.open })).toBeTruthy())
  fireEvent.click(screen.getByRole('tab', { name: zh.installed }))
  card = within(screen.getByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: zh.open }))
  expect(store.open).toHaveBeenCalledWith(media.id)
})

it('keeps existing cards on refresh failure and lets the user retry', async () => {
  const { store, page } = setup()
  page()
  await screen.findByRole('article', { name: media.title })
  store.load.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
  expect((await screen.findByRole('alert')).textContent).toBe(zh.loadError)
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(store.load).toHaveBeenLastCalledWith(true)
})

it('opens installed workbenches offline and explains why new installs are disabled', async () => {
  const { store, page } = setup([{ ...media, installable: false }, notes])
  page()
  const unavailable = within(await screen.findByRole('article', { name: media.title }))
  const install = unavailable.getByRole<HTMLButtonElement>('button', { name: zh.offlineInstall })
  expect(install.disabled).toBe(true)
  fireEvent.click(install)
  expect(store.install).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: zh.installed }))
  fireEvent.click(within(screen.getByRole('article', { name: notes.title })).getByRole('button', { name: zh.open }))
  expect(store.open).toHaveBeenCalledWith(notes.id)
})

it('asks for a signed-in account when the private registry refuses the install or the documentation', async () => {
  const { store, page } = setup()
  store.install.mockRejectedValueOnce(Object.assign(new Error('Sign in'), { code: 'qingclaw-workbench/sign-in-required' }))
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: zh.install }))
  expect((await screen.findByRole('alert')).textContent).toBe(zh.signInRequired)

  store.readReadme.mockRejectedValueOnce(Object.assign(new Error('Sign in'), { code: 'qingclaw-workbench/sign-in-required' }))
  fireEvent.click(card.getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  expect(await detail.findByText(zh.signInRequired)).toBeTruthy()
})

it('asks for the professional plan when the installation needs the licence', async () => {
  const { store, page } = setup()
  store.install.mockRejectedValueOnce(Object.assign(new Error('Pro'), { code: 'qingclaw-workbench/pro-required' }))
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: zh.install }))
  expect((await screen.findByRole('alert')).textContent).toBe(zh.proRequired)
})

it('shows the workbench details and installs the exact selection from that page', async () => {
  const { page, store } = setup()
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: '查看自媒体工作台详情' }))

  expect(await screen.findByRole('heading', { name: media.title, level: 1 })).toBeTruthy()
  const detail = within(screen.getByRole('region', { name: media.title }))
  expect(detail.getByText(media.description)).toBeTruthy()
  expect(await screen.findByRole('heading', { name: '使用指南' })).toBeTruthy()
  expect(store.readReadme).toHaveBeenCalledWith(media.id, media.version, 'zh')
  expect(detail.getByRole('heading', { name: zh.versionsTitle })).toBeTruthy()
  expect(detail.getAllByText(media.version).length).toBeGreaterThan(0)
  expect(detail.getByRole('heading', { name: zh.sourceTitle })).toBeTruthy()
  expect(detail.getByText(media.registry)).toBeTruthy()
  expect(store.install).not.toHaveBeenCalled()
  expect(store.open).not.toHaveBeenCalled()

  fireEvent.click(detail.getByRole('button', { name: zh.install }))
  const open = await detail.findByRole('button', { name: zh.open })
  expect(store.install).toHaveBeenCalledWith(media.id)
  fireEvent.click(open)
  expect(store.open).toHaveBeenCalledWith(media.id)
})

it('preserves the tab, search, and category when returning from a workbench detail', async () => {
  const { page } = setup([{ ...media, favorite: true }, { ...notes, favorite: true }])
  page()
  await screen.findByRole('article', { name: media.title })
  fireEvent.click(screen.getByRole('tab', { name: zh.favorites }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: media.author } })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: media.category } })

  const card = within(screen.getByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: '查看自媒体工作台详情' }))
  fireEvent.click(await screen.findByRole('button', { name: '返回工作台' }))

  expect(screen.getByRole('tab', { name: zh.favorites, selected: true })).toBeTruthy()
  expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe(media.author)
  expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe(media.category)
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('article', { name: media.title })).toBeTruthy()
})
