/** Public QingClaw service origins sealed into one packaged Desktop application. */

import { QINGCLAW_DESKTOP_DISTRIBUTION } from './distribution.ts'

export type QingClawDesktopDeploymentName = keyof typeof QINGCLAW_DESKTOP_DISTRIBUTION.services.platformOrigins

/** Validated public deployment metadata and the exact Host environment it owns. */
export interface QingClawDesktopDeployment {
  readonly name: QingClawDesktopDeploymentName
  readonly platformOrigin: string
  readonly inferenceOrigin: string
  readonly environment: Readonly<Pick<NodeJS.ProcessEnv, 'QINGCLAW_PLATFORM_ORIGIN' | 'QINGCLAW_INFERENCE_ORIGIN'>>
}

/**
 * Verify public service metadata carried by the signed application manifest.
 * Exact known origins are stricter than accepting an arbitrary syntactically valid URL: a
 * modified package cannot redirect account or model traffic while keeping a recognized lane.
 * @param manifest Parsed packaged application manifest.
 * @returns the deployment and environment values the Host must receive.
 */
export function qingclawDesktopDeployment(manifest: unknown): QingClawDesktopDeployment {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('QingClaw Desktop carries invalid deployment metadata')
  }
  const metadata = manifest as Record<string, unknown>
  const name = metadata.qingclawDesktopDeployment
  if (name !== 'test' && name !== 'production') {
    throw new Error('QingClaw Desktop carries invalid deployment metadata')
  }
  const platformOrigin = QINGCLAW_DESKTOP_DISTRIBUTION.services.platformOrigins[name]
  const inferenceOrigin = QINGCLAW_DESKTOP_DISTRIBUTION.services.inferenceOrigin
  if (metadata.qingclawPlatformOrigin !== platformOrigin || metadata.qingclawInferenceOrigin !== inferenceOrigin) {
    throw new Error('QingClaw Desktop carries invalid deployment metadata')
  }
  return Object.freeze({
    name,
    platformOrigin,
    inferenceOrigin,
    environment: Object.freeze({
      QINGCLAW_PLATFORM_ORIGIN: platformOrigin,
      QINGCLAW_INFERENCE_ORIGIN: inferenceOrigin,
    }),
  })
}
