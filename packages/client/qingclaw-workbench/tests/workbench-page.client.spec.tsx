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
  installed: false, installable: true, openable: false, favorite: false, updateAvailable: false, enabled: true,
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
    update: vi.fn(async (id: string) => update(id, { installedVersion: '1.0.0', updateAvailable: false })),
    uninstall: vi.fn(async (id: string) => update(id, { installed: false, openable: false })),
    setEnabled: vi.fn(async (id: string, enabled: boolean) => update(id, { enabled })),
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
  // The detail page is the description plus screenshots; documentation and source facts are gone.
  expect(detail.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  expect(detail.queryByText(media.registry)).toBeNull()
  expect(store.install).not.toHaveBeenCalled()
  expect(store.open).not.toHaveBeenCalled()

  fireEvent.click(detail.getByRole('button', { name: zh.install }))
  const open = await detail.findByRole('button', { name: zh.open })
  expect(store.install).toHaveBeenCalledWith(media.id)
  fireEvent.click(open)
  expect(store.open).toHaveBeenCalledWith(media.id)
})

it('shows the manifest logo and every preview image the catalog declares', async () => {
  const logo = 'https://beta.qingclaw.com/workbenches/desk-logo.webp'
  const previews = ['https://beta.qingclaw.com/workbenches/one.webp', 'https://beta.qingclaw.com/workbenches/two.webp']
  const { page } = setup([{ ...media, iconUrl: logo, previews }])
  const { container } = page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  expect(container.querySelector(`img[src="${logo}"]`)).toBeTruthy()
  expect(detail.getAllByAltText('自媒体工作台的界面预览').map(image => image.getAttribute('src'))).toEqual(previews)
})

it('pages through the declared screenshots and opens one full size', async () => {
  const previews = ['https://example.com/one.webp', 'https://example.com/two.webp']
  const { page } = setup([{ ...media, previews }])
  page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  const slides = detail.getAllByRole('button', { name: '放大查看自媒体工作台的截图' })
  expect(slides).toHaveLength(2)

  fireEvent.click(slides[1] as HTMLElement)

  const lightbox = await screen.findByRole('dialog')
  expect(lightbox.querySelector('img')?.getAttribute('src')).toBe(previews[1])
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps the single preview and default artwork for catalogs that declare only a cover', async () => {
  const { page } = setup([media])
  const { container } = page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  expect(detail.getAllByAltText('自媒体工作台的界面预览').map(image => image.getAttribute('src')))
    .toEqual([media.previewUrl])
  expect(container.querySelector('header img')).toBeNull()
})

it('shows related-resource cards that open the declared links', async () => {
  const link = { url: 'https://weixin.qq.com/sph/AHfxwU7MP7', title: '视频号', image: 'https://cdn.example.com/cover.webp' }
  const { page } = setup([{ ...media, links: [link] }])
  page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  expect(detail.getByRole('heading', { name: zh.relatedLinks })).toBeTruthy()
  const card = detail.getByRole('link', { name: '视频号' })
  expect(card.getAttribute('href')).toBe(link.url)
  expect(card.getAttribute('target')).toBe('_blank')
})

it('offers an update when the catalog version is newer than the installed one', async () => {
  const { store, page } = setup([{ ...media, installed: true, installable: false, openable: true,
    installedVersion: '0.9.0', updateAvailable: true }])
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  fireEvent.click(card.getByRole('button', { name: '更新到 1.0.0' }))
  await waitFor(() => expect(store.update).toHaveBeenCalledWith(media.id))
})

it('uninstalls an installed workbench from its detail page after a confirmation', async () => {
  const { store, page } = setup([{ ...media, installed: true, installable: false, openable: true }])
  page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  fireEvent.click(detail.getByRole('button', { name: '卸载自媒体工作台' }))
  expect(store.uninstall).not.toHaveBeenCalled()

  const dialog = within(await screen.findByRole('dialog'))
  expect(dialog.getByText('卸载后它提供的功能会消失。')).toBeTruthy()
  fireEvent.click(dialog.getByRole('button', { name: zh.uninstall }))
  await waitFor(() => expect(store.uninstall).toHaveBeenCalledWith(media.id))
})

it('marks a disabled workbench and toggles it from its page', async () => {
  const { store, page } = setup([{ ...media, installed: true, installable: false, openable: true, enabled: false }])
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  expect(card.getByText(zh.disabled)).toBeTruthy()
  expect(card.queryByRole('button', { name: zh.open })).toBeNull()

  fireEvent.click(card.getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  const toggle = detail.getByRole('switch', { name: '启用自媒体工作台' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  await waitFor(() => expect(store.setEnabled).toHaveBeenCalledWith(media.id, true))
})

it('replaces the installed label with the update action', async () => {
  const { page } = setup([{ ...media, installed: true, installable: false, openable: false,
    installedVersion: '0.9.0', updateAvailable: true }])
  page()
  const card = within(await screen.findByRole('article', { name: media.title }))
  expect(card.getByRole('button', { name: '更新到 1.0.0' })).toBeTruthy()
  expect(card.queryByText(zh.installed)).toBeNull()
})

it('does not repeat the installed label on the product page', async () => {
  const { page } = setup([{ ...media, installed: true, installable: false, openable: false }])
  page()
  fireEvent.click(within(await screen.findByRole('article', { name: media.title }))
    .getByRole('button', { name: '查看自媒体工作台详情' }))
  const detail = within(await screen.findByRole('region', { name: media.title }))
  expect(detail.queryByText(zh.installed)).toBeNull()
  expect(detail.getByRole('button', { name: '卸载自媒体工作台' })).toBeTruthy()
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
