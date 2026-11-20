import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detectPluginProjects, readRegistryHistory } from '../src/project.ts'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'qingclaw-plugin-project-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const plugin = { name: '@qinglion/desk', version: '1.2.0', dsh: { client: {} }, author: { name: 'Creator' },
  qingclaw: { workbench: { panelId: 'desk' } } }
async function manifest(dir: string, value: object) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(value))
}

it('discovers a new manifest in an initially empty local workspace without mistaking ordinary npm packages for plugins', async () => {
  expect(await detectPluginProjects(root)).toEqual([])
  await manifest(root, { name: '@qinglion/other', version: '1.0.0', main: 'index.js' })
  expect(await detectPluginProjects(root)).toEqual([])
  await manifest(root, plugin)
  expect(await detectPluginProjects(root)).toMatchObject([{ name: '@qinglion/desk', directory: '.', kind: 'workbench', panelId: 'desk', author: 'Creator' }])
})

it.each(['npm','pnpm'])('discovers declared %s members while respecting exclusions, symlinks and the workspace boundary', async (manager) => {
  const dir = join(root, 'workspace')
  const patterns = ['packages/*', '!packages/skip', '../outside']
  await manifest(dir, manager === 'npm' ? { workspaces: { packages: patterns } } : {})
  if (manager === 'pnpm') await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n' + patterns.map(p => "  - '" + p + "'").join('\n'))
  await manifest(join(root, 'outside'), plugin)
  await Promise.all(['one','two','skip'].map(folder => manifest(join(dir, 'packages', folder), { ...plugin, name: '@qinglion/' + folder })))
  await symlink(join(root, 'outside'), join(dir, 'packages', 'symlink'))
  expect((await detectPluginProjects(dir)).map(x => x.directory)).toEqual(['packages/one','packages/two'])
})

it('reads exact package versions and timestamps through the registry anonymous read contract without any account token', async () => {
  const name = '@qinglion/dsh-media-desk'
  const fetch = vi.spyOn(globalThis, 'fetch')
  try {
    fetch.mockResolvedValueOnce(Response.json({ name, versions: { '2.0.0': {}, '2.7.2': {} }, time: { '2.7.2': '2026-11-19T00:00:00Z' } }))
    expect(await readRegistryHistory(name, new AbortController().signal)).toEqual([
      { version: '2.7.2', published_at: '2026-11-19T00:00:00.000Z' }, { version: '2.0.0', published_at: null },
    ])
    expect(fetch.mock.calls[0]?.[0]?.toString()).toBe('https://npm.qingclaw.com/%40qinglion%2Fdsh-media-desk')
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ accept: 'application/json' })
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }))
    await expect(readRegistryHistory(name, new AbortController().signal)).rejects.toThrow('registry_unavailable')
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await readRegistryHistory(name, new AbortController().signal)).toEqual([])
  } finally { fetch.mockRestore() }
})
