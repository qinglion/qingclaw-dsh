// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchFeedResult } from '../src/types.ts'
import { WorkbenchPage, type WorkbenchPageProps } from '../src/client/WorkbenchPage.tsx'
import { dailyQuoteKey } from '../src/client/daily-quote.ts'
import { NS, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const dictionary: Readonly<Record<string, string>> = zh
const t: TranslateNS<typeof NS> = (key, params) => {
  const value = dictionary[key] ?? key
  if (params === undefined) return value
  return Object.entries(params).reduce((text, [name, replacement]) =>
    text.replaceAll(`{${name}}`, String(replacement)), value)
}

const ready: WorkbenchFeedResult = {
  source: 'network',
  stale: false,
  feed: {
    schemaVersion: 1,
    revision: 'r1',
    updatedAt: '2026-11-14T08:00:00Z',
    latestVideos: [{
      id: 'v1',
      title: '律师 AI 实战',
      courseTitle: '律师 AI 课',
      duration: '12:34',
      coverUrl: 'https://qingclaw.com/video.jpg',
      watchUrl: 'https://qingclaw.com/videos/v1',
    }],
    featuredCourses: [{
      id: 'c1',
      title: '律师 AI 课',
      lessonCount: 8,
      courseUrl: 'https://qingclaw.com/courses/c1',
    }],
    links: { allCourses: 'https://qingclaw.com/courses' },
  },
}

function page(loadFeed: WorkbenchPageProps['loadFeed']) {
  return render(<WorkbenchPage {...({ t, loadFeed } as WorkbenchPageProps)} />)
}

it('selects one quote for the entire local calendar day', () => {
  expect(dailyQuoteKey(new Date(2026, 10, 14, 0, 1))).toBe(dailyQuoteKey(new Date(2026, 10, 14, 23, 59)))
  expect(dailyQuoteKey(new Date(2026, 10, 15))).not.toBe(dailyQuoteKey(new Date(2026, 10, 14)))
})

it('loads Feed v1 once, renders official cards, and keeps external links isolated', async () => {
  const loadFeed = vi.fn<(refresh: boolean) => Promise<WorkbenchFeedResult>>().mockResolvedValue(ready)
  page(loadFeed)
  expect(screen.getAllByText('正在同步官网内容…')).toHaveLength(2)
  expect(await screen.findByText('律师 AI 实战')).toBeTruthy()
  expect(loadFeed).toHaveBeenCalledExactlyOnceWith(false)
  const video = screen.getByRole('link', { name: '观看视频: 律师 AI 实战' })
  expect(video.getAttribute('href')).toBe('https://qingclaw.com/videos/v1')
  expect(video.getAttribute('rel')).toContain('noopener')
  expect(screen.getByText('8 节公开课')).toBeTruthy()
  expect(screen.getByRole('link', { name: '查看全部课程' }).getAttribute('href'))
    .toBe('https://qingclaw.com/courses')
})

it('shows last-good freshness and requests an explicit refresh from the header', async () => {
  const loadFeed = vi.fn<(refresh: boolean) => Promise<WorkbenchFeedResult>>()
    .mockResolvedValueOnce({ ...ready, source: 'last-good', stale: true })
    .mockResolvedValueOnce(ready)
  page(loadFeed)
  expect(await screen.findByText(zh.stale)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
  await waitFor(() => { expect(loadFeed).toHaveBeenLastCalledWith(true) })
  await waitFor(() => { expect(screen.queryByText(zh.stale)).toBeNull() })
})

it('keeps a failed first load in place and retries without remounting the page', async () => {
  const loadFeed = vi.fn<(refresh: boolean) => Promise<WorkbenchFeedResult>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(ready)
  page(loadFeed)
  expect((await screen.findByRole('alert')).textContent).toContain(zh.unavailableTitle)
  fireEvent.click(screen.getByRole('button', { name: zh.retry }))
  expect(await screen.findByText('律师 AI 实战')).toBeTruthy()
  expect(loadFeed.mock.calls).toEqual([[false], [true]])
})
