/** Provider selection for Desktop release publication without changing the publication state machine. */
import {
  desktopStorageConfig,
  requireDesktopCosCredentials,
  requireDesktopOssCredentials,
  type DesktopPublishConfig,
  type DesktopUploadCredentials,
} from './desktop-publish-config.ts'
import { desktopPublishCos, desktopPublishCosWriter } from './desktop-publish-cos.ts'
import { desktopPublishOss, desktopPublishOssWriter } from './desktop-publish-oss.ts'
import type { DesktopPublishTransport, DesktopVerifiedObjectWriter } from './desktop-publish.ts'
import type { DesktopUploadPlan } from './desktop-upload-types.ts'

/** Read/write adapters bound to one validated plan and provider. */
export interface DesktopPublishStorage {
  readonly transport: DesktopPublishTransport
  readonly verifiedWriter: DesktopVerifiedObjectWriter
}

/** Construct provider-specific adapters after public config and credentials have both been validated. */
export function createDesktopPublishStorage(plan: DesktopUploadPlan, config: DesktopPublishConfig,
  credentials: DesktopUploadCredentials): DesktopPublishStorage {
  const storage = desktopStorageConfig(config)
  if (storage.provider === 'aliyun-oss') {
    const destination = { region: storage.region, bucket: config.bucket }
    const selected = requireDesktopOssCredentials(credentials)
    return { transport: desktopPublishOss(plan, destination, selected),
      verifiedWriter: desktopPublishOssWriter(plan, destination, selected) }
  }
  const selected = requireDesktopCosCredentials(credentials)
  return { transport: desktopPublishCos(plan, selected), verifiedWriter: desktopPublishCosWriter(plan, selected) }
}
