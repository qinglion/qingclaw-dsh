import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { detectPluginProject, projectRoute } from '../src/project.ts'
import type { ProjectRouteInputs } from '../src/project.ts'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'qingclaw-plugin-project-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const plugin = { name: '@qinglion/desk', version: '1.2.0', dsh: { client: {} }, author: { name: 'Creator' },
  qingclaw: { workbench: { panelId: 'desk' } } }
async function manifest(dir: string, value: object) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(value))
}

it('discovers a new manifest in an initially empty workspace without mistaking ordinary npm packages for plugins', async () => {
  expect(await detectPluginProject(root)).toBeUndefined()
  await manifest(root, { name: '@qinglion/other', version: '1.0.0', main: 'index.js' })
  expect(await detectPluginProject(root)).toBeUndefined()
  await manifest(root, plugin)
  expect(await detectPluginProject(root)).toMatchObject({ name: '@qinglion/desk', kind: 'workbench', panelId: 'desk', author: 'Creator' })
})

it('reads only the directory it is given, so a collection workspace keeps its packages out of discovery', async () => {
  await manifest(root, { name: 'collection', version: '1.0.0' })
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  await manifest(join(root, 'packages', 'one'), { ...plugin, name: '@qinglion/one' })
  expect(await detectPluginProject(root)).toBeUndefined()
  expect(await detectPluginProject(join(root, 'packages', 'one'))).toMatchObject({ name: '@qinglion/one' })
})

const url = 'https://local.test/api/qingclaw-creator/project?workspace=w1'
const sessionUrl = 'https://local.test/api/qingclaw-creator/project?session=s1'

function route(overrides: Partial<ProjectRouteInputs> = {}) {
  const inputs: ProjectRouteInputs = {
    workspace: id => id === 'w1' ? { path: root } : undefined,
    session: id => id === 's1' ? root : undefined,
    ...overrides,
  }
  return projectRoute(inputs)
}

it('reports the root project for a registered workspace without changing what it can publish', async () => {
  await manifest(root, plugin)
  const response = await route()(new Request(url))
  expect(response.status).toBe(200)
  const body = await response.json() as { project?: { name: string } }
  expect(body.project?.name).toBe('@qinglion/desk')
  await rm(join(root, 'package.json'))
  const empty = await route()(new Request(url))
  expect(await empty.json()).toEqual({})
})

it('answers for a session directory and for one named directory inside it', async () => {
  await manifest(root, { name: 'collection', version: '1.0.0' })
  await manifest(join(root, 'dsh-codex'), { ...plugin, name: '@qinglion/dsh-codex' })
  const empty = await route()(new Request(sessionUrl))
  expect(await empty.json()).toEqual({})
  const named = await route()(new Request(sessionUrl + '&directory=dsh-codex'))
  expect(await named.json()).toMatchObject({ project: { name: '@qinglion/dsh-codex' } })
  const escaped = await route()(new Request(sessionUrl + '&directory=../outside'))
  const warning = (await escaped.json() as { warning?: string }).warning
  expect(warning).toContain('包目录')
  const absent = await route()(new Request(sessionUrl + '&directory=nope'))
  expect(await absent.json()).toEqual({ missing: true })
  const unknown = await route({ session: () => undefined })(new Request(sessionUrl))
  expect(unknown.status).toBe(404)
})

it('accepts a client-supplied session directory when the Host cannot resolve the session', async () => {
  await manifest(root, plugin)
  const fetch = route({ session: () => undefined })
  const resolved = await fetch(new Request(sessionUrl + '&cwd=' + encodeURIComponent(root)))
  expect(await resolved.json()).toMatchObject({ project: { name: '@qinglion/desk' } })
  const relative = await fetch(new Request(sessionUrl + '&cwd=relative/path'))
  expect(relative.status).toBe(404)
  const missing = await fetch(new Request(sessionUrl + '&cwd=' + encodeURIComponent(join(root, 'absent'))))
  expect(missing.status).toBe(404)
})

it('refuses unknown workspaces and reports an unreadable one', async () => {
  await manifest(root, plugin)
  expect((await route({ workspace: () => undefined })(new Request(url))).status).toBe(404)
  const fetch = route()
  await rm(root, { recursive: true, force: true })
  expect((await fetch(new Request(url))).status).toBe(404)
})
