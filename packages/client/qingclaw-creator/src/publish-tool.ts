import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { publish } from 'libnpmpublish'
import { inspectArchive, registry, type PublishTarget } from './publish-archive.ts'
import { detectPluginProjects } from './project.ts'

const accountChanged = '青狮账号已更改，请从当前会话重新发起发布。'

async function publishedIntegrity(target: PublishTarget, signal: AbortSignal, registryUrl: string): Promise<string | undefined> {
  const response = await fetch(new URL(encodeURIComponent(target.packageName), registryUrl), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
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

function projectWorkspace(ctx: Context, sessionId: SessionId) {
  return ctx.workspaceRegistry.list().find(workspace => workspace.sessionIds.includes(sessionId))
}

/** Publish the captured archive through npm's own library without exposing the account grant to a child process. */
export async function publishPackage(
  ctx: Context,
  sessionId: SessionId,
  target: PublishTarget & { account: string },
  signal: AbortSignal,
  registryUrl = registry,
) {
  const workspace = projectWorkspace(ctx, sessionId)
  const session = await ctx.deepseekAccount.getPlatformSession()
  if (!workspace || !session) throw new Error('请在已登录青狮的插件工作区中发布。')
  const prepared = await inspectArchive(workspace.path, target)
  const verifyAccount = async () => {
    signal.throwIfAborted()
    const now = await ctx.deepseekAccount.getPlatformSession()
    if (now?.origin !== session.origin || now.token !== session.token
        || projectWorkspace(ctx, sessionId)?.id !== workspace.id) throw new Error(accountChanged)
  }
  await verifyAccount()
  const headers = new Headers(session.requestHeaders)
  headers.set('X-DSH-Auth-Token', session.token)
  headers.set('Accept', 'application/json')
  const response = await fetch(new URL('/auth-api/v0/dsh/registry/publish-grant', session.origin), {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (!response.ok) throw new Error(response.status === 403 ? '当前青狮账号没有发布权限。' : '无法获取青狮发布授权，请检查登录状态后重试。')
  const grant = await response.json() as { username?: string; password?: string; registry?: string; expires_at?: string }
  if (grant.username !== target.account || !/^qc-[1-9]\d*$/.test(target.account)) throw new Error(accountChanged)
  if (!grant.password || !/^qcn_[a-zA-Z0-9_-]{43}$/.test(grant.password)
      || (grant.registry !== registryUrl && grant.registry !== registryUrl.slice(0, -1))
      || !(Date.parse(grant.expires_at ?? '') > Date.now())) throw new Error('青狮发布授权无效或已到期。')

  const inspectVersion = async () => {
    const known = await publishedIntegrity(target, signal, registryUrl)
    if (known && known !== prepared.integrity) throw new Error('该版本已被其他内容占用，请更新版本号后重新打包。')
    return known
  }
  const result = { packageName: target.packageName, version: target.version, integrity: prepared.integrity }
  const alreadyPublished = await inspectVersion()
  await verifyAccount()
  if (alreadyPublished) return { ...result, status: 'already_published' }
  const login = await fetch(new URL('-/user/org.couchdb.user:' + grant.username, registryUrl), {
    method: 'PUT', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ name: grant.username, password: grant.password, type: 'user', roles: [] }),
  })
  if (!login.ok) throw new Error('青狮 npm 暂未接受本次发布授权，请稍后重试。')
  const auth = await login.json() as { token?: unknown }
  if (typeof auth.token !== 'string' || !auth.token || auth.token.length > 16384 || /\s/.test(auth.token)) {
    throw new Error('青狮 npm 返回的令牌无效。')
  }
  await verifyAccount()
  const endpoint = new URL(registryUrl)
  const transport = endpoint.protocol === 'https:' ? new HttpsAgent() : new HttpAgent()
  const abortUpload = () => transport.destroy()
  signal.addEventListener('abort', abortUpload, { once: true })
  let failureCode = ''
  try {
    // Options are assembled here. The workspace's .npmrc, hooks and environment
    // never receive these credentials. Redirects may not forward them off-origin.
    await publish({ ...prepared.manifest, tag: prepared.tag }, prepared.bytes, {
      registry: registryUrl, ['//' + new URL(registryUrl).host + '/:_authToken']: auth.token,
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
    failureCode = code === 'E403' || code === 'E401' ? '私服拒绝发布，请检查当前账号的创作者权限和包归属。' : '无法确认私服写入结果，请稍后重试。'
  } finally {
    signal.removeEventListener('abort', abortUpload)
    transport.destroy()
  }
  if (await inspectVersion()) return { ...result, status: 'published' }
  throw new Error(failureCode || '私服尚未返回对应版本，请稍后重试。')
}

/** Install one deferred native tool for the authoring skill in registered plugin workspaces. */
export function registerPublishTool(ctx: Context, canReadProjects: () => Promise<boolean>): void {
  ctx.tools.register(defineTool({
    name: 'qingclaw_publish_package',
    description: 'Publish a reviewed npm pack archive from this plugin workspace to QingClaw with the signed-in creator account. Use after an explicit publish request and the qingclaw-plugin-publish skill.',
    deferLoading: true, timeoutMs: 120000,
    parameters: {
      directory: { type: 'string', required: true, description: 'Workspace-relative package directory, or a dot for its root.' },
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
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('当前工具仅支持工作区会话。')
      return publishPackage(ctx, exec.agent.session.id, args, exec.signal)
    },
  }), { when: async ({ agent, signal }) => {
    const workspace = projectWorkspace(ctx, agent.session.id)
    if (signal.aborted || !workspace) return false
    try {
      return (await detectPluginProjects(workspace.path)).length > 0 && !signal.aborted && await canReadProjects()
    } catch { return false }
  } })
}
