import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create } from 'tar'
import { expect, it } from 'vitest'
import { listingMetadataIssues } from '../src/listing.ts'
import { inspectArchive } from '../src/publish-archive.ts'

const files = new Map([
  ['assets/workbench/icon.webp', 1000],
  ['assets/workbench/one.webp', 1000],
  ['assets/workbench/two.webp', 1000],
  ['assets/workbench/huge.webp', 3 * 1024 * 1024],
])

const workbench = {
  qingclaw: {
    name: { zh: '工作台' },
    description: { zh: '收集灵感' },
    workbench: { panelId: 'desk', icon: './assets/workbench/icon.webp',
      previews: ['./assets/workbench/one.webp', './assets/workbench/two.webp'] },
  },
}

it('accepts a complete workbench release', () => {
  expect(listingMetadataIssues(workbench, files)).toEqual([])
})

it('names every listing field a release still misses', () => {
  expect(listingMetadataIssues({ qingclaw: { workbench: { panelId: 'desk', previews: ['assets/workbench/one.webp'] } } }, files))
    .toEqual([
      '缺少 qingclaw.name.zh',
      '缺少 qingclaw.description.zh',
      '缺少 qingclaw.workbench.icon',
      'qingclaw.workbench.previews 至少需要 2 张图片',
    ])
})

it('rejects images the published archive cannot serve', () => {
  const issues = listingMetadataIssues({
    qingclaw: { ...workbench.qingclaw, workbench: { panelId: 'desk',
      icon: './assets/workbench/huge.webp',
      previews: ['../secret.webp', 'assets/workbench/missing.webp'] } },
  }, files)
  expect(issues).toEqual([
    'qingclaw.workbench.icon 的图片超过 2 MB：assets/workbench/huge.webp',
    'qingclaw.workbench.previews 不是包内图片路径：../secret.webp',
    'qingclaw.workbench.previews 的图片不在包里：assets/workbench/missing.webp',
  ])
})

it('checks the related links a release declares', () => {
  const base = { name: { zh: '插件' }, description: { zh: '描述' } }
  expect(listingMetadataIssues({ qingclaw: { ...base, links: ['https://weixin.qq.com/sph/AHfxwU7MP7'] } }, files))
    .toEqual([])
  expect(listingMetadataIssues({ qingclaw: { ...base, links: ['http://insecure.example.com'] } }, files))
    .toEqual(['qingclaw.links 必须是 1 至 8 个 https 链接'])
  expect(listingMetadataIssues({ qingclaw: { ...base, links: Array(9).fill('https://a.example.com') } }, files))
    .toEqual(['qingclaw.links 必须是 1 至 8 个 https 链接'])
})

it('refuses to inspect an archive whose manifest cannot be listed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qingclaw-listing-'))
  try {
    const manifest = { name: '@qinglion/plain', version: '1.0.0', qingclaw: { resourceType: 'plugin' } }
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))
    const stage = join(directory, 'packed')
    await mkdir(join(stage, 'package'), { recursive: true })
    await writeFile(join(stage, 'package/package.json'), JSON.stringify(manifest))
    const archive = 'qinglion-plain-1.0.0.tgz'
    await create({ cwd: stage, file: join(directory, archive), gzip: true }, ['package/package.json'])
    const bytes = await readFile(join(directory, archive))
    const target = { packageName: manifest.name, version: manifest.version, directory: '.', archive,
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }

    await expect(inspectArchive(directory, target)).rejects.toThrow('上架元数据不完整：缺少 qingclaw.name.zh')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
