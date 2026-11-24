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

function route(overrides: Partial<ProjectRouteInputs> = {}) {
  const inputs: ProjectRouteInputs = {
    canReadProjects: async () => true,
    workspace: id => id === 'w1' ? { path: root } : undefined,
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

it('refuses unknown callers and workspaces and reports an unreadable one', async () => {
  await manifest(root, plugin)
  expect((await route({ canReadProjects: async () => false })(new Request(url))).status).toBe(403)
  expect((await route({ workspace: () => undefined })(new Request(url))).status).toBe(404)
  const fetch = route()
  await rm(root, { recursive: true, force: true })
  expect((await fetch(new Request(url))).status).toBe(404)
})
