// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PublishPanel, publishPrompt } from '../src/client/PublishPanel.tsx'
import { getSessionPlugin, getSessionProjectAt } from '../src/client/project-api.ts'
import { zh } from '../src/client/locales.ts'
import type { PluginProject } from '../src/project-types.ts'

vi.mock('../src/client/project-api.ts', () => ({ getSessionPlugin: vi.fn(), getSessionProjectAt: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

const desk: PluginProject = { name: '@qinglion/desk', title: 'Desk', version: '1.0.0', kind: 'plugin' }
const sessionId = 'session-1' as SessionId

function mount() {
  const props = { sessionId, publish: vi.fn(), t: (key: keyof typeof zh) => zh[key] }
  render(<PublishPanel {...props as ComponentProps<typeof PublishPanel>} />)
  return props
}

it('publishes the plugin of the session directory by writing the request into that conversation', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue(desk)
  const props = mount()
  expect(await screen.findByText(desk.name + ' · .')).toBeTruthy()
  expect(screen.getByText(desk.version)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.publish }))
  expect(props.publish).toHaveBeenCalledWith(sessionId, { directory: '.', project: desk })
  const prompt = publishPrompt({ directory: '.', project: desk })
  for (const field of ['qingclaw-plugin-publish', desk.name, desk.version]) expect(prompt).toContain(field)
})

it('asks for one subdirectory when the session directory root holds no plugin', async () => {
  const codex: PluginProject = { ...desk, name: '@qinglion/dsh-codex' }
  vi.mocked(getSessionPlugin).mockResolvedValue(undefined)
  vi.mocked(getSessionProjectAt).mockResolvedValue(codex)
  const props = mount()
  expect(await screen.findByText(zh.unrecognizedRoot)).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText(zh.publishDirectory), { target: { value: 'dsh-codex' } })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  expect(await screen.findByText('@qinglion/dsh-codex · dsh-codex')).toBeTruthy()
  expect(getSessionProjectAt).toHaveBeenCalledWith(sessionId, 'dsh-codex', expect.any(AbortSignal))
  fireEvent.click(screen.getByRole('button', { name: zh.publish }))
  expect(props.publish).toHaveBeenCalledWith(sessionId, { directory: 'dsh-codex', project: codex })
})

it('says so when the chosen directory holds no plugin', async () => {
  vi.mocked(getSessionPlugin).mockResolvedValue(undefined)
  vi.mocked(getSessionProjectAt).mockResolvedValue(undefined)
  mount()
  fireEvent.change(await screen.findByPlaceholderText(zh.publishDirectory), { target: { value: 'packages/empty' } })
  fireEvent.click(screen.getByRole('button', { name: zh.publishUse }))
  expect(await screen.findByText(zh.publishMissing)).toBeTruthy()
})
