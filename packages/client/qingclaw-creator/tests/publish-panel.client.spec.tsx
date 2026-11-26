// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PublishPanel, nextRelease, publishPrompt } from '../src/client/PublishPanel.tsx'
import { submitListing } from '../src/client/api.ts'
import { getSessionPlugin, getSessionProjectAt } from '../src/client/project-api.ts'
import { zh } from '../src/client/locales.ts'
import type { PluginProject } from '../src/project-types.ts'

vi.mock('../src/client/project-api.ts', () => ({ getSessionPlugin: vi.fn(), getSessionProjectAt: vi.fn() }))
vi.mock('../src/client/api.ts', () => ({ submitListing: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); window.localStorage.clear() })

const desk: PluginProject = { name: '@qinglion/desk', title: 'Desk', version: '1.0.0', kind: 'plugin' }
const sessionId = 'session-1' as SessionId
const cwd = '/Users/me/collection'
const BINDING = 'qingclaw.creator.publish.v1.session-1'

function mount(directory: string | undefined = cwd) {
  const props = {
    sessionId, directoryOf: () => directory, publish: vi.fn(),
    t: (key: keyof typeof zh) => zh[key],
  }
  render(<PublishPanel {...props as ComponentProps<typeof PublishPanel>} />)
  return props
}

it('publishes the plugin of the session directory by writing the request into that conversation', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue({ project: desk })
  const props = mount()
  expect(screen.getByRole('heading', { name: zh.publishTitle })).toBeTruthy()
  expect(await screen.findByText(desk.name + ' · ./')).toBeTruthy()
  expect(screen.getByText(desk.version)).toBeTruthy()
  expect(screen.getByTitle(cwd)).toBeTruthy()
  expect(getSessionPlugin).toHaveBeenCalledWith(sessionId, cwd, expect.any(AbortSignal))
  expect(screen.getByText(zh.publishNext + ' 1.0.1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.publish }))
  expect(props.publish).toHaveBeenCalledWith(sessionId, { directory: '.', project: desk })
  const prompt = publishPrompt({ directory: '.', project: desk })
  for (const field of ['qingclaw-plugin-publish', desk.name, '1.0.1', '提交并推送']) expect(prompt).toContain(field)
  // The published version is the bumped one, never the version already on the registry.
  expect(prompt).not.toContain('"version"')
})

it('names the next patch release and drops a prerelease suffix', () => {
  expect(nextRelease('2.7.7')).toBe('2.7.8')
  expect(nextRelease('2.7.9-beta.1')).toBe('2.7.10')
  expect(nextRelease('1.0')).toBeUndefined()
  expect(nextRelease('latest')).toBeUndefined()
})

it('associates one subdirectory with the session and publishes it on the next visit', async () => {
  const codex: PluginProject = { ...desk, name: '@qinglion/dsh-codex' }
  vi.mocked(getSessionPlugin).mockResolvedValue({})
  vi.mocked(getSessionProjectAt).mockResolvedValue({ project: codex })
  const props = mount()
  expect(await screen.findByText(zh.unrecognizedRoot)).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText(zh.publishDirectory), { target: { value: 'dsh-codex' } })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  expect(await screen.findByText('@qinglion/dsh-codex · dsh-codex')).toBeTruthy()
  expect(getSessionProjectAt).toHaveBeenCalledWith(sessionId, 'dsh-codex', cwd, expect.any(AbortSignal))
  expect(window.localStorage.getItem(BINDING)).toBe('dsh-codex')
  fireEvent.click(screen.getByRole('button', { name: zh.publish }))
  expect(props.publish).toHaveBeenCalledWith(sessionId, { directory: 'dsh-codex', project: codex })
})

it('reopens on the associated directory without asking again', async () => {
  const codex: PluginProject = { ...desk, name: '@qinglion/dsh-codex' }
  window.localStorage.setItem(BINDING, 'dsh-codex')
  vi.mocked(getSessionProjectAt).mockResolvedValue({ project: codex })
  mount()
  expect(await screen.findByText('@qinglion/dsh-codex · dsh-codex')).toBeTruthy()
  expect(getSessionPlugin).not.toHaveBeenCalled()
})

it('drops an association whose directory no longer holds a package', async () => {
  window.localStorage.setItem(BINDING, 'gone')
  vi.mocked(getSessionPlugin).mockResolvedValue({})
  vi.mocked(getSessionProjectAt).mockResolvedValue({})
  mount()
  expect(await screen.findByText(zh.unrecognizedRoot)).toBeTruthy()
  expect(window.localStorage.getItem(BINDING)).toBeNull()
})

it('says the session directory could not be read instead of blaming a workspace', async () => {
  vi.mocked(getSessionPlugin).mockRejectedValue(new Error('directory_unavailable'))
  mount()
  const notice = await screen.findByRole('alert')
  expect(notice.textContent).toContain(zh.noticeReadFailed)
  expect(notice.textContent).toContain(zh.publishReadFailed)
})

it('requests the listing for the same package version from the page', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue({ project: desk })
  vi.mocked(submitListing).mockResolvedValue({})
  mount()
  fireEvent.click(await screen.findByRole('button', { name: zh.publishList }))
  await waitFor(() => { expect(submitListing).toHaveBeenCalledWith(desk.name, desk.version, expect.any(AbortSignal)) })
  expect(await screen.findByText(zh.submitted)).toBeTruthy()
})

it('still asks for a package directory when the root manifest cannot be read', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue({ warning: 'EACCES' })
  mount()
  expect(await screen.findByText(zh.unrecognizedRoot)).toBeTruthy()
  expect(screen.getByText(zh.publishRootWarning + ' EACCES')).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText(zh.publishDirectory), { target: { value: 'dsh-codex' } })
  vi.mocked(getSessionProjectAt).mockResolvedValue({ warning: '工作区目录已变更。' })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain(zh.publishMissing)
  expect(alert.textContent).toContain('工作区目录已变更。')
})

it('shows the website refusal verbatim when a listing is declined', async () => {
  const message = '该版本缺少上架必填信息：侧边 logo、工作台预览图（至少 2 张）。请在 package.json 的 qingclaw 中补充后重新发版。'
  vi.mocked(getSessionPlugin).mockResolvedValue({ project: desk })
  vi.mocked(submitListing).mockRejectedValue(new Error(message))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: zh.publishList }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain(zh.noticeListingRefused)
  expect(alert.textContent).toContain(message)
})

it('names a subdirectory that does not exist instead of a failed read', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue({})
  vi.mocked(getSessionProjectAt).mockResolvedValue({ missing: true })
  mount()
  fireEvent.change(await screen.findByPlaceholderText(zh.publishDirectory), { target: { value: 'nope' } })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toBe(zh.publishDirectoryMissing)
})

it('says so when the chosen directory holds no plugin', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue({})
  vi.mocked(getSessionProjectAt).mockResolvedValue({})
  mount()
  fireEvent.change(await screen.findByPlaceholderText(zh.publishDirectory), { target: { value: 'packages/empty' } })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  expect(await screen.findByText(zh.publishMissing)).toBeTruthy()
})
