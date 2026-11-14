/** Publish one already packaged target from an external builder job to QingClaw's OSS layout. */
import { isAbsolute, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { DesktopPackageTargetName } from './package-target.ts'
import { desktopTargetPlatform } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createDesktopUploadPlan, type DesktopUploadPlan } from './desktop-upload-plan.ts'
import { tagDesktopRelease } from './desktop-release-tag.ts'
import { requiredEnvironmentValue } from '@deepseek-ai/dsh-desktop-publisher/desktop-auto-update-environment.mjs'
import { desktopPublishOss, desktopPublishOssWriter } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-oss.ts'
import { publishDesktopRelease, publishDesktopReleaseFiles } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish.ts'
import { createDesktopPublicationRecord, withDesktopChannelLock } from '@deepseek-ai/dsh-desktop-publisher/desktop-publish-record.ts'
import { prepareWebsiteInstallerPlan, uploadWebsiteInstaller } from '@deepseek-ai/dsh-desktop-publisher/desktop-website-installer.ts'

const SUPPORTED_TARGETS = new Set<DesktopPackageTargetName>(['mac-arm64', 'mac-x64', 'win-x64'])
const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')

/** Invalid command arguments or builder-owned publication settings. */
export class BuilderPublishUsageError extends Error {}

/** Parse the intentionally small contract exposed to yuejuan-builder. */
export function parseBuilderPublishArgs(args: string[]): {
  target: DesktopPackageTargetName
  withLatest: boolean
  recordsRoot: string
} {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: {
    'with-latest': { type: 'boolean' },
    'records-root': { type: 'string' },
  } })
  if (positionals.length !== 1 || !SUPPORTED_TARGETS.has(positionals[0] as DesktopPackageTargetName)) {
    throw new BuilderPublishUsageError('expected one target: mac-arm64, mac-x64, or win-x64')
  }
  const recordsRoot = values['records-root'] === undefined
    ? resolve(import.meta.dirname, '../.desktop-build/builder-publish-records')
    : values['records-root']
  if (!isAbsolute(recordsRoot)) throw new BuilderPublishUsageError('--records-root must be absolute')
  return { target: positionals[0] as DesktopPackageTargetName,
    withLatest: values['with-latest'] === true, recordsRoot }
}

/** Parse the aggregate macOS release contract exposed to yuejuan-builder. */
export function parseBuilderReleaseArgs(args: string[]): {
  targets: readonly ['mac-arm64', 'mac-x64']
  withLatest: boolean
  recordsRoot: string
} {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: {
    'with-latest': { type: 'boolean' },
    'records-root': { type: 'string' },
  } })
  if (positionals.length !== 2
    || new Set(positionals).size !== 2
    || !positionals.includes('mac-arm64')
    || !positionals.includes('mac-x64')) {
    throw new BuilderPublishUsageError('expected both targets exactly once: mac-arm64 mac-x64')
  }
  const recordsRoot = values['records-root'] === undefined
    ? resolve(import.meta.dirname, '../.desktop-build/builder-publish-records')
    : values['records-root']
  if (!isAbsolute(recordsRoot)) throw new BuilderPublishUsageError('--records-root must be absolute')
  if (values['with-latest'] !== true) {
    throw new BuilderPublishUsageError('aggregate macOS release requires --with-latest')
  }
  return { targets: ['mac-arm64', 'mac-x64'], withLatest: true, recordsRoot }
}

type BuilderCommand = ReturnType<typeof parseBuilderPublishArgs>

function releaseTag(plan: DesktopUploadPlan): void {
  if (plan.commit === undefined) throw new Error('desktop publish: production package record has no commit')
  const tagged = tagDesktopRelease({ version: plan.version, commit: plan.commit, repositoryRoot: REPOSITORY_ROOT })
  if (tagged.status === 'failed') {
    throw new Error(`${tagged.tag} was not pushed; ${tagged.detail ?? 'unknown git failure'}`)
  }
}

async function prepareBuilderTarget(command: BuilderCommand, ambient: NodeJS.ProcessEnv) {
  const target = desktopTargetPlatform(command.target)
  // Publication only needs the public preset (deployment, channel and object layout).
  // Do not require or re-read signing/notarization credentials on the aggregate
  // publisher job after the signed artifacts have already been retained.
  const packageEnvironment = loadDesktopPackageEnvironment(target.platform, ambient, undefined, { prepareOnly: true })
  const deployment = packageEnvironment.DSH_DESKTOP_AUTO_UPDATE_ENV
  if (deployment !== 'test' && deployment !== 'production') {
    throw new BuilderPublishUsageError('packaged deployment must be test or production')
  }
  const bucket = requiredEnvironmentValue(ambient, 'OSS_BUCKET_NAME')
  const environment = { ...packageEnvironment,
    [`DOWNLOAD_${deployment === 'test' ? 'TEST' : 'PROD'}_COS_BUCKET`]: bucket }
  const plan = await createDesktopUploadPlan(command.target, { environment })
  const region = requiredEnvironmentValue(ambient, 'OSS_REGION')
  if (!/^oss-[a-z0-9-]+$/u.test(region)) throw new BuilderPublishUsageError('OSS_REGION must be an Aliyun OSS region')
  const credentials = {
    accessKeyId: requiredEnvironmentValue(ambient, 'OSS_ACCESS_KEY_ID'),
    accessKeySecret: requiredEnvironmentValue(ambient, 'OSS_ACCESS_KEY_SECRET'),
  }
  const destination = { region, bucket: plan.bucket }
  const destinationId = JSON.stringify({ provider: 'aliyun-oss', region, bucket: plan.bucket,
    environment: plan.environment, target: plan.target, publicUrl: plan.publicUrl })
  const latest = command.withLatest
    ? await createDesktopUploadPlan(command.target, { environment, latest: true })
      .then(async latestPlan => ({ plan: latestPlan, installer: await prepareWebsiteInstallerPlan(latestPlan) }))
    : undefined
  try {
    const record = await createDesktopPublicationRecord(resolve(command.recordsRoot, 'records'), {
      repository: ambient.GITHUB_REPOSITORY ?? 'local/qingclaw-dsh',
      runId: ambient.GITHUB_RUN_ID ?? `local-${process.pid}`,
      attempt: ambient.GITHUB_RUN_ATTEMPT ?? '1',
      actor: ambient.GITHUB_ACTOR ?? 'local-builder',
      destination: destinationId,
      operation: 'publish',
      reason: 'yuejuan-builder packaged release',
    })
    return { command, deployment, environment, plan, latest, destination, destinationId, credentials, record,
      finished: false as boolean }
  } catch (error) {
    await latest?.installer.handle.close()
    throw error
  }
}

type PreparedBuilderTarget = Awaited<ReturnType<typeof prepareBuilderTarget>>

async function publishLatest(prepared: PreparedBuilderTarget): Promise<void> {
  const latest = prepared.latest
  if (latest === undefined) return
  const { plan: latestPlan, installer } = latest
  try {
    const transport = desktopPublishOss(latestPlan, prepared.destination, prepared.credentials)
    const outcome = await uploadWebsiteInstaller(installer, transport,
      desktopPublishOssWriter(latestPlan, prepared.destination, prepared.credentials),
      async (event) => {
        if (event === 'upload-intent') await prepared.record.record({ type: 'put-intent', key: installer.plan.artifacts[0].key })
      })
    await prepared.record.record({ type: outcome === 'present' ? 'object-present' : 'put-verified',
      key: installer.plan.artifacts[0].key })
  } finally { await installer.handle.close() }
}

async function publishPreparedTarget(prepared: PreparedBuilderTarget, deferTag: boolean, acquireLock = true): Promise<void> {
  try {
    const publish = async () => {
      const operations = {
        transport: desktopPublishOss(prepared.plan, prepared.destination, prepared.credentials),
        record: prepared.record.record,
      }
      if (deferTag) await publishDesktopReleaseFiles(prepared.plan, operations)
      else {
        const result = await publishDesktopRelease(prepared.plan, {
          ...operations,
          async tag() { releaseTag(prepared.plan) },
        })
        if (result.status === 'published-tag-pending') {
          await prepared.record.finish('published-tag-pending')
          prepared.finished = true
          throw new Error(`desktop publish: update objects are public but desktop-v${prepared.plan.version} is still pending`)
        }
      }
      await publishLatest(prepared)
    }
    if (acquireLock) {
      await withDesktopChannelLock(resolve(prepared.command.recordsRoot, 'locks'), prepared.destinationId, publish)
    } else await publish()
    if (!deferTag) {
      await prepared.record.finish('complete')
      prepared.finished = true
    }
  } catch (error) {
    if (!prepared.finished) {
      await prepared.record.finish('failed')
      prepared.finished = true
    }
    throw error
  }
}

async function withPreparedLocks(
  prepared: PreparedBuilderTarget[],
  index: number,
  callback: () => Promise<void>,
): Promise<void> {
  const target = prepared[index]
  if (target === undefined) return callback()
  await withDesktopChannelLock(resolve(target.command.recordsRoot, 'locks'), target.destinationId,
    async () => withPreparedLocks(prepared, index + 1, callback))
}

async function closePreparedInstallers(prepared: PreparedBuilderTarget[]): Promise<void> {
  await Promise.all(prepared.map(async target => target.latest?.installer.handle.close()))
}

async function finishDeferredRelease(prepared: PreparedBuilderTarget[]): Promise<void> {
  if (prepared[0]?.deployment === 'production') {
    try { releaseTag(prepared[0].plan) }
    catch (error) {
      for (const target of prepared) {
        if (target.finished) continue
        await target.record.record({ type: 'tag-pending' })
        await target.record.finish('published-tag-pending')
        target.finished = true
      }
      throw error
    }
  }
  for (const target of prepared) {
    await target.record.record({ type: 'complete' })
    await target.record.finish('complete')
    target.finished = true
  }
}

function validateAggregateRelease(prepared: PreparedBuilderTarget[]): void {
  const [first, ...rest] = prepared
  if (first === undefined || rest.some(target => target.deployment !== first.deployment
    || target.plan.version !== first.plan.version
    || target.plan.bucket !== first.plan.bucket
    || target.latest?.plan.environment !== first.latest?.plan.environment
    || target.latest?.plan.version !== first.latest?.plan.version
    || target.latest?.plan.bucket !== first.latest?.plan.bucket)) {
    throw new BuilderPublishUsageError('aggregate targets must share deployment, version, and bucket')
  }
  if (prepared.some(target => target.latest === undefined
    || target.latest.plan.environment !== target.plan.environment
    || target.latest.plan.version !== target.plan.version
    || target.latest.plan.bucket !== target.plan.bucket
    || target.latest.plan.commit !== target.plan.commit
    || target.latest.plan.dirty !== target.plan.dirty)) {
    throw new BuilderPublishUsageError('aggregate targets must prevalidate matching fixed installers')
  }
  if (first.deployment === 'production') {
    if (first.plan.commit === undefined || !/^[a-f0-9]{40}$/u.test(first.plan.commit) || first.plan.dirty !== false
      || rest.some(target => target.plan.commit !== first.plan.commit || target.plan.dirty !== false
        || target.latest?.plan.commit !== first.latest?.plan.commit || target.latest?.plan.dirty !== false)) {
      throw new BuilderPublishUsageError('aggregate production targets must share the packaged commit and clean state')
    }
  }
}

/**
 * Reconcile one packaged release into Aliyun OSS, optionally updating the website's fixed installer alias.
 * Credentials are ambient builder secrets and never enter the retained record.
 */
export async function publishBuilderTarget(args: string[], ambient: NodeJS.ProcessEnv = process.env): Promise<void> {
  const command = parseBuilderPublishArgs(args)
  const prepared = await prepareBuilderTarget(command, ambient)
  try {
    await publishPreparedTarget(prepared, false)
    process.stdout.write(`QingClaw Desktop published: ${prepared.plan.target} ${prepared.plan.version} -> ${prepared.plan.publicUrl}\n`)
  } finally { await closePreparedInstallers([prepared]) }
}

/** Publish both retained macOS targets and create the production tag only after both fixed aliases succeed. */
export async function publishBuilderRelease(args: string[], ambient: NodeJS.ProcessEnv = process.env): Promise<void> {
  const command = parseBuilderReleaseArgs(args)
  const prepared: PreparedBuilderTarget[] = []
  try {
    for (const target of command.targets) {
      prepared.push(await prepareBuilderTarget({ target, withLatest: command.withLatest, recordsRoot: command.recordsRoot }, ambient))
    }
    validateAggregateRelease(prepared)
    await withPreparedLocks(prepared, 0, async () => {
      for (const target of prepared) await publishPreparedTarget(target, true, false)
      await finishDeferredRelease(prepared)
    })
    process.stdout.write(`QingClaw Desktop release published: ${prepared[0]?.plan.version} (${command.targets.join(', ')})\n`)
  } catch (error) {
    for (const target of prepared) {
      if (target.finished) continue
      await target.record.finish('failed')
      target.finished = true
    }
    throw error
  } finally { await closePreparedInstallers(prepared) }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  try { await publishBuilderTarget(process.argv.slice(2)) }
  catch (error) {
    const usage = error instanceof BuilderPublishUsageError
      || (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS_'))
    process.stderr.write(`${usage ? 'QingClaw builder publish usage error' : 'QingClaw builder publish failed'}: ${
      error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
