import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { publish } from 'libnpmpublish'
import { sessionDirectory } from './project.ts'
import { inspectArchive, registry, type PublishTarget } from './publish-archive.ts'

const accountChanged = '青狮账号已更改，请从当前会话重新发起发布。'

async function publishedIntegrity(
  target: PublishTarget, signal: AbortSignal, registryUrl: string, token: string,
): Promise<string | undefined> {
  // The private registry answers reads only a signed-in account; the publish login
  // already produced the token this check uses.
  const response = await fetch(new URL(encodeURIComponent(target.packageName), registryUrl), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache', authorization: 'Bearer ' + token },
    redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (response.status === 404) return
  if (!response.ok) throw new Error('无法核对私服版本，请稍后重试。')
  const packument = await response.json() as { name?: string; versions?: Record<string, { dist?: { integrity?: unknown } }> }
  if (packument.name !== target.packageName || typeof packument.versions !== 'object' || !packument.versions) {
    throw new Error('私服返回的包信息无效。')
  }
  const version = packument.versions[target.version]
  if (!version) return
  if (typeof version.dist?.integrity !== 'string') throw new Error('私服版本缺少完整性记录。')
  return version.dist.integrity
}



/**
 * Publish the captured archive through npm's own library without exposing the account grant to a child process.
 * @param ctx - Host context providing the signed-in account.
 * @param root - resolves the directory the request publishes in; re-read before each write.
 * @param target - the package name, version, archive, and account, plus the optional directory.
 * @param signal - aborts the publish.
 * @param registryUrl - registry to publish to.
 * @returns the published identity, the resolved directory, and whether this call wrote it.
 */
export async function publishPackage(
  ctx: Context,
  root: () => string,
  target: PublishTarget & { account: string },
  signal: AbortSignal,
  registryUrl = registry,
) {
  const directory = root()
  const session = await ctx.deepseekAccount.getPlatformSession()
  if (!session) throw new Error('请先登录青狮后再发布。')
  const prepared = await inspectArchive(directory, target)
  const verifyAccount = async () => {
    signal.throwIfAborted()
    const now = await ctx.deepseekAccount.getPlatformSession()
    if (now?.origin !== session.origin || now.token !== session.token) throw new Error(accountChanged)
    if (root() !== directory) throw new Error('发布期间会话目录已变更，请重新发起发布。')
  }
  await verifyAccount()
  const headers = new Headers(session.requestHeaders)
  headers.set('X-DSH-Auth-Token', session.token)
  headers.set('Accept', 'application/json')
  const response = await fetch(new URL('/auth-api/v0/dsh/registry/publish-grant', session.origin), {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (!response.ok) {
    throw new Error(response.status === 402 ? '发布插件需要专业版，请先开通专业版后再试。'
      : response.status === 403 ? '当前青狮账号没有发布权限。'
        : '无法获取青狮发布授权，请检查登录状态后重试。')
  }
  const grant = await response.json() as { username?: string; password?: string; registry?: string; expires_at?: string }
  if (grant.username !== target.account || !/^qc-[1-9]\d*$/.test(target.account)) throw new Error(accountChanged)
  if (!grant.password || !/^qcn_[a-zA-Z0-9_-]{43}$/.test(grant.password)
      || (grant.registry !== registryUrl && grant.registry !== registryUrl.slice(0, -1))
      || !(Date.parse(grant.expires_at ?? '') > Date.now())) throw new Error('青狮发布授权无效或已到期。')

  // Log in first: the same token authorizes the version check that follows.
  const login = await fetch(new URL('-/user/org.couchdb.user:' + grant.username, registryUrl), {
    method: 'PUT', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ name: grant.username, password: grant.password, type: 'user', roles: [] }),
  })
  if (!login.ok) throw new Error('青狮 npm 暂未接受本次发布授权，请稍后重试。')
  const auth = await login.json() as { token?: unknown }
  const token = auth.token
  if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) {
    throw new Error('青狮 npm 返回的令牌无效。')
  }
  await verifyAccount()
  const inspectVersion = async () => {
    const known = await publishedIntegrity(target, signal, registryUrl, token)
    if (known && known !== prepared.integrity) throw new Error('该版本已被其他内容占用，请更新版本号后重新打包。')
    return known
  }
  const result = { packageName: target.packageName, version: target.version, integrity: prepared.integrity, directory: prepared.directory }
  const alreadyPublished = await inspectVersion()
  await verifyAccount()
  if (alreadyPublished) return { ...result, status: 'already_published' }
  const endpoint = new URL(registryUrl)
  const transport = endpoint.protocol === 'https:' ? new HttpsAgent() : new HttpAgent()
  const abortUpload = () => transport.destroy()
  signal.addEventListener('abort', abortUpload, { once: true })
  let failureCode = ''
  try {
    // Options are assembled here. The workspace's .npmrc, hooks and environment
    // never receive these credentials. Redirects may not forward them off-origin.
    await publish({ ...prepared.manifest, tag: prepared.tag }, prepared.bytes, {
      registry: registryUrl, ['//' + new URL(registryUrl).host + '/:_authToken']: token,
      access: (prepared.manifest.publishConfig as { access?: string } | undefined)?.access === 'restricted' ? 'restricted' : 'public',
      // npm-registry-fetch does not forward redirect/signal options; bind the transport itself.
      agent: (url: URL) => {
        signal.throwIfAborted()
        if (url.origin !== endpoint.origin || decodeURIComponent(url.pathname) !== '/' + target.packageName || url.search) {
          throw new Error('Unexpected npm upload destination')
        }
        return transport
      },
      defaultTag: prepared.tag, redirect: 'error', retry: { retries: 0 }, timeout: 60000, signal,
    })
  } catch (error) {
    // npm errors may carry request options. Keep all such objects inside this host call.
    const code: unknown = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const status: unknown = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
    failureCode = status === 413 || code === 'E413'
      ? '包归档超过私服允许的 100 MB，请精简包内容（例如预览图）后重新发版。'
      : code === 'E403' || code === 'E401' ? '私服拒绝发布，请检查当前账号的创作者权限和包归属。' : '无法确认私服写入结果，请稍后重试。'
  } finally {
    signal.removeEventListener('abort', abortUpload)
    transport.destroy()
  }
  if (await inspectVersion()) return { ...result, status: 'published' }
  throw new Error(failureCode || '私服尚未返回对应版本，请稍后重试。')
}

/**
 * Install one deferred native tool for the authoring skill in every session of a signed-in creator.
 * @param ctx - Host context providing the tools registry.
 * @param canReadProjects - creator access reader.
 */
export function registerPublishTool(ctx: Context, canReadProjects: () => Promise<boolean>): void {
  // The package directory this Session already published from, relative to the
  // Session's directory. Asking once is enough: a later request reuses it, and a
  // stale entry is dropped when it no longer holds the requested package.
  const bound = new Map<SessionId, string>()
  ctx.tools.register(defineTool({
    name: 'qingclaw_publish_package',
    description: 'Publish a reviewed npm pack archive from a package directory inside the session directory, which is the branch worktree for a session created on a branch, to QingClaw with the signed-in creator account. Use after an explicit publish request and the qingclaw-plugin-publish skill.',
    deferLoading: true, timeoutMs: 120000,
    parameters: {
      directory: { type: 'string', description: 'Package directory relative to the session directory, a dot for the session directory itself. Omit it to reuse the package this session published last, or to resolve the one directory whose manifest declares this package and version.' },
      packageName: { type: 'string', required: true, description: 'The exact @qinglion package name.' },
      version: { type: 'string', required: true, description: 'Version from npm pack.' },
      archive: { type: 'string', required: true, description: 'Tarball filename from npm pack in that package directory.' },
      integrity: { type: 'string', required: true, description: 'SHA-512 SRI from npm pack --json.' },
      account: { type: 'string', required: true, description: 'Opaque author identity supplied by the freshly loaded publishing skill.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        packageName: { type: 'string', required: true }, version: { type: 'string', required: true },
        integrity: { type: 'string', required: true }, status: { type: 'string', required: true },
        directory: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('当前工具仅支持工作区会话。')
      const session = exec.agent.session
      const chosen = args.directory ?? bound.get(session.id)
      try {
        const result = await publishPackage(
          ctx,
          () => sessionDirectory(ctx, session),
          chosen === undefined ? args : { ...args, directory: chosen },
          exec.signal,
        )
        bound.set(session.id, result.directory)
        return result
      } catch (error) {
        bound.delete(session.id)
        throw error
      }
    },
  }), { when: async ({ signal }) => {
    if (signal.aborted) return false
    return await canReadProjects()
  } })
}
