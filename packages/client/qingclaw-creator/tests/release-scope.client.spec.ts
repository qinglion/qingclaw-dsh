// @vitest-environment jsdom
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { registerReleaseTab } from '../src/client/release-tab.tsx'
import { getWorkspaceProjects } from '../src/client/project-api.ts'
import type { PluginProject } from '../src/project-types.ts'

vi.mock('../src/client/project-api.ts', () => ({ getWorkspaceProjects: vi.fn() }))
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); vi.restoreAllMocks() })

const desk: PluginProject = { name: '@qinglion/desk', title: 'My desk', version: '1.0.0', directory: '.', kind: 'workbench' }
interface Entry { inject: (id: string) => { publish: (p: PluginProject) => Promise<void> } }

it('discovers a newly created plugin, targets only the visible workspace, and revokes stale release actions', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  let selected = 's1'
  let entries: PluginProject[] = []
  let tab: Entry | undefined
  const pendingPrompt = vi.fn().mockResolvedValue({ ok: true })
  const listeners = new Set<() => void>()
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }
  const ctx = {
    locale: { register: () => () => {}, bind: () => () => '发布' },
    slots: {
      inject: (_key: string, setup: () => () => void) => setup(),
      register: (entry: Entry) => { tab = entry; return () => { tab = undefined } },
    },
    workspaces: { list: { subscribe, getSnapshot: () => ({ items: [
      { workspaceId: 'w1', path: '/plugin', sessionIds: ['s1'] }, { workspaceId: 'w2', path: '/other', sessionIds: ['s2'] },
    ] }) } },
    sessions: { list: { subscribe, getSnapshot: () => ({ byId: { [selected]: { id: selected, retainedBy: { mainView: 1 } } } }) },
      binding: () => ({ session: { prompt: pendingPrompt } }) },
  } as unknown as Context
  vi.mocked(getWorkspaceProjects).mockImplementation(async id => id === 'w1' ? entries : [])
  const stop = registerReleaseTab(ctx)
  try {
    await vi.advanceTimersByTimeAsync(1)
    expect(tab).toBeUndefined()
    entries = [desk]
    await vi.advanceTimersByTimeAsync(20000)
    const actions = tab?.inject('s1')
    expect(actions).toBeDefined()
    await actions!.publish(desk)
    expect(pendingPrompt.mock.calls[0]?.[0][0].text).toContain(desk.name)
    selected = 's2'
    listeners.forEach(fn => fn())
    expect(tab).toBeUndefined()
    await expect(actions!.publish(desk)).rejects.toThrow('changed')
    expect(pendingPrompt).toHaveBeenCalledTimes(1)
  } finally { stop() }
})
