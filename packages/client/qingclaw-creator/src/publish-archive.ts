import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { Parser } from 'tar'
import { listingMetadataIssues } from './listing.ts'
import { detectPluginProject, findPluginPackages, packageDirectory } from './project.ts'

export const registry = 'https://npm.qingclaw.com/'
const unzip = promisify(gunzip)
const maxPackage = 100 * 1024 * 1024

export interface PublishTarget {
  /** Workspace-relative package directory; omitted resolves it from the package name and version. */
  directory?: string
  packageName: string
  version: string
  archive: string
  integrity: string
}

async function readArchive(bytes: Buffer): Promise<{ manifest: Record<string, unknown>; files: Map<string, number> }> {
  const plain = await unzip(bytes, { maxOutputLength: 512 * 1024 * 1024 })
  if (plain.subarray(257, 262).toString('ascii') !== 'ustar') throw new Error('Expected an npm tar archive')
  const chunks: Buffer[] = []
  const paths = new Set<string>()
  const files = new Map<string, number>()
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
      if (entry.type === 'File') files.set(path.slice('package/'.length), entry.size)
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
  return { manifest: manifest as Record<string, unknown>, files }
}

/**
 * Resolve the directory this request publishes. A named directory must hold the
 * requested package and version; an unnamed request resolves the one workspace
 * directory whose manifest declares them.
 * @param root - the workspace real path.
 * @param target - the request's package identity and optional directory.
 * @returns the real package directory.
 */
async function targetDirectory(root: string, target: PublishTarget): Promise<string> {
  if (target.directory !== undefined) {
    const directory = await packageDirectory(root, target.directory)
    if (directory === undefined) throw new Error('当前会话工作区中的包目录不存在。')
    const project = await detectPluginProject(directory)
    if (!project || project.name !== target.packageName || project.version !== target.version) {
      throw new Error('当前会话工作区中的包或版本已变更。')
    }
    return directory
  }
  const matches = await findPluginPackages(root, target.packageName, target.version)
  const [match] = matches
  if (match === undefined) throw new Error('工作区中没有找到该包名和版本对应的插件目录，请指定要发布的目录。')
  if (matches.length > 1) throw new Error('工作区中有多个目录声明了该包名和版本，请指定要发布的目录：' + matches.join('、'))
  return join(root, match)
}

/** Capture and validate exactly the tarball produced by npm pack before requesting a publishing grant. */
export async function inspectArchive(workspace: string, target: PublishTarget) {
  if (!/^@qinglion\/[a-z0-9][a-z0-9._~-]*$/.test(target.packageName)
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(target.version)
      || !/^[a-zA-Z0-9_][a-zA-Z0-9._~+-]*\.tgz$/.test(target.archive)) throw new Error('无效的目标包或归档文件名。')
  const root = await realpath(workspace)
  const directory = await targetDirectory(root, target)
  const archivePath = join(directory, target.archive)
  const before = await lstat(archivePath)
  if (!before.isFile()) throw new Error('包归档应为普通文件。')
  const file = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  let bytes: Buffer
  try {
    const info = await file.stat()
    if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || info.size <= 0 || info.size > maxPackage) throw new Error('包归档应为 100 MB 以内的普通文件。')
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
  const { manifest, files } = await readArchive(bytes).catch(() => { throw new Error('包归档或 package/package.json 无效。') })
  if (manifest.name !== target.packageName || manifest.version !== target.version || manifest.private) {
    throw new Error('归档清单与选中的包不一致，或该包已标记 private。')
  }
  const config = (manifest.publishConfig ?? {}) as Record<string, unknown>
  if (typeof config !== 'object' || Array.isArray(config) || (config.registry !== undefined && config.registry !== registry
    && config.registry !== registry.slice(0, -1))) throw new Error('包的发布地址必须指向青狮 npm。')
  const tag = config.tag ?? 'latest'
  if (typeof tag !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(tag)) throw new Error('发布标签无效。')
  // The directory refuses a release without listing metadata, so publishing checks it first.
  const issues = listingMetadataIssues(manifest, files)
  if (issues.length > 0) {
    throw new Error('上架元数据不完整：' + issues.join('；') + '。请补齐 package.json 的 qingclaw 后重新执行 npm pack。')
  }
  return { bytes, manifest, integrity, tag, directory: relative(root, directory) || '.' }
}
