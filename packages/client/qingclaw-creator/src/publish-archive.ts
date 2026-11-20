import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { Parser } from 'tar'
import { detectPluginProjects } from './project.ts'

export const registry = 'https://npm.qingclaw.com/'
const unzip = promisify(gunzip)
const maxPackage = 25 * 1024 * 1024

export interface PublishTarget {
  directory: string
  packageName: string
  version: string
  archive: string
  integrity: string
}

async function readManifest(bytes: Buffer): Promise<Record<string, unknown>> {
  const plain = await unzip(bytes, { maxOutputLength: 128 * 1024 * 1024 })
  if (plain.subarray(257, 262).toString('ascii') !== 'ustar') throw new Error('Expected an npm tar archive')
  const chunks: Buffer[] = []
  const paths = new Set<string>()
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({ strict: true, maxMetaEntrySize: 16384 })
    parser.on('error', reject).on('end', resolve)
    parser.on('ignoredEntry', () => parser.abort(new Error('Unsupported archive entry')))
    parser.on('entry', (entry) => {
      const path = String(entry.path).replace(/\/$/, '')
      if (!['File', 'Directory'].includes(entry.type) || !path.startsWith('package/')
          || path.split('/').some(part => !part || part === '..' || part === '.') || /[\\\x00-\x1f]/.test(path)
          || paths.size >= 20000 || paths.has(path)) return parser.abort(new Error('Invalid package file'))
      paths.add(path)
      if (path === 'package/package.json') {
        if (entry.type !== 'File' || entry.size > 256 * 1024) return parser.abort(new Error('Invalid manifest'))
        entry.on('data', (chunk: Buffer) => chunks.push(chunk))
      }
      entry.resume()
    })
    parser.end(plain)
  })
  const manifest: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid manifest')
  return manifest as Record<string, unknown>
}

/** Capture and validate exactly the tarball produced by npm pack before requesting a publishing grant. */
export async function inspectArchive(workspace: string, target: PublishTarget) {
  if (!/^@qinglion\/[a-z0-9][a-z0-9._~-]*$/.test(target.packageName)
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(target.version)
      || !/^[a-zA-Z0-9_][a-zA-Z0-9._~+-]*\.tgz$/.test(target.archive)) throw new Error('无效的目标包或归档文件名。')
  const root = await realpath(workspace)
  const projects = await detectPluginProjects(root)
  if (!projects.some(p => p.directory === target.directory && p.name === target.packageName && p.version === target.version)) {
    throw new Error('当前会话工作区中的包或版本已变更。')
  }
  const directory = join(root, target.directory)
  if (await realpath(directory) !== directory) throw new Error('工作区目录已变更。')
  const archivePath = join(directory, target.archive)
  const before = await lstat(archivePath)
  if (!before.isFile()) throw new Error('包归档应为普通文件。')
  const file = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  let bytes: Buffer
  try {
    const info = await file.stat()
    if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || info.size <= 0 || info.size > maxPackage) throw new Error('包归档应为 25 MB 以内的普通文件。')
    bytes = Buffer.alloc(info.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset)
      if (!result.bytesRead) throw new Error('包归档已变更。')
      offset += result.bytesRead
    }
  } finally { await file.close() }
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
  if (integrity !== target.integrity) throw new Error('包内容已变更，请重新执行 npm pack 并核对完整性。')
  const manifest = await readManifest(bytes).catch(() => { throw new Error('包归档或 package/package.json 无效。') })
  if (manifest.name !== target.packageName || manifest.version !== target.version || manifest.private) {
    throw new Error('归档清单与选中的包不一致，或该包已标记 private。')
  }
  const config = (manifest.publishConfig ?? {}) as Record<string, unknown>
  if (typeof config !== 'object' || Array.isArray(config) || (config.registry !== undefined && config.registry !== registry
    && config.registry !== registry.slice(0, -1))) throw new Error('包的发布地址必须指向青狮 npm。')
  const tag = config.tag ?? 'latest'
  if (typeof tag !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(tag)) throw new Error('发布标签无效。')
  return { bytes, manifest, integrity, tag }
}
