/** Listing metadata a release declares in `qingclaw`, checked before a publish. */

// SVG is a listing image too: the directory serves it as image/svg+xml, so one file stays
// sharp at every size and can follow the theme instead of baking one colour.
const IMAGE = /^(?:\.\/)?[a-zA-Z0-9_][a-zA-Z0-9._/-]*\.(?:webp|png|jpe?g|svg)$/
const SITE_IMAGE = /^\/workbenches\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(?:webp|png|jpe?g|svg)$/
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Whether a value is one absolute https URL without credentials. */
function httpsLink(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname !== '' && parsed.username === '' && parsed.password === ''
  } catch {
    return false
  }
}

/**
 * Check the fields the QingClaw directory needs before it can list this release.
 * @param manifest - the packed `package.json`.
 * @param files - archive entries keyed by package-relative path, with their byte sizes.
 * @returns one actionable sentence per missing or invalid field; empty when the release can be listed.
 */
export function listingMetadataIssues(manifest: Record<string, unknown>, files: ReadonlyMap<string, number>): string[] {
  const qingclaw = record(manifest.qingclaw)
  const issues: string[] = []
  if (text(record(qingclaw.name).zh) === undefined) issues.push('缺少 qingclaw.name.zh')
  if (text(record(qingclaw.description).zh) === undefined) issues.push('缺少 qingclaw.description.zh')

  if (qingclaw.links !== undefined) {
    const links = Array.isArray(qingclaw.links) ? qingclaw.links : []
    const shape = (link: unknown): boolean => {
      if (typeof link === 'string') return httpsLink(link)
      if (!isRecord(link) || !httpsLink(link.url)) return false
      if (link.title !== undefined && (typeof link.title !== 'string' || !link.title.trim() || link.title.length > 200)) return false
      if (link.image === undefined) return true
      return typeof link.image === 'string' && (httpsLink(link.image) || IMAGE.test(link.image))
    }
    const valid = links.length >= 1 && links.length <= 8 && links.every(shape)
    if (!valid) issues.push('qingclaw.links 必须是 1 至 8 个 https 链接，或 { url, title, image } 对象')
    for (const [index, link] of links.entries()) {
      if (!isRecord(link) || typeof link.image !== 'string' || httpsLink(link.image)) continue
      checkLinkImage(link.image.replace(/^\.\//, ''), index, files, issues)
    }
  }

  const workbench = record(qingclaw.workbench)
  if (text(workbench.panelId) === undefined) return issues

  const checkImage = (reference: string, field: string): void => {
    if (SITE_IMAGE.test(reference)) return
    if (!IMAGE.test(reference) || reference.split('/').includes('..')) {
      issues.push(`${field} 不是包内图片路径：${reference}`)
      return
    }
    const path = reference.replace(/^\.\//, '')
    const size = files.get(path)
    if (size === undefined) issues.push(`${field} 的图片不在包里：${path}`)
    else if (size > MAX_IMAGE_BYTES) issues.push(`${field} 的图片超过 2 MB：${path}`)
  }

  const icon = text(workbench.icon)
  if (icon === undefined) issues.push('缺少 qingclaw.workbench.icon')
  else checkImage(icon, 'qingclaw.workbench.icon')

  const previews = (Array.isArray(workbench.previews) ? workbench.previews : [])
    .filter((item): item is string => typeof item === 'string')
  if (previews.length < 2) issues.push('qingclaw.workbench.previews 至少需要 2 张图片')
  for (const reference of previews.slice(0, 8)) checkImage(reference, 'qingclaw.workbench.previews')
  return issues
}

/** A packaged link cover must exist in the archive and stay under the image cap. */
function checkLinkImage(path: string, index: number, files: ReadonlyMap<string, number>, issues: string[]): void {
  const field = `qingclaw.links 第 ${index + 1} 条的封面`
  if (!IMAGE.test(path) || path.split('/').includes('..')) {
    issues.push(`${field} 不是包内图片路径：${path}`)
    return
  }
  const size = files.get(path)
  if (size === undefined) issues.push(`${field} 的图片不在包里：${path}`)
  else if (size > MAX_IMAGE_BYTES) issues.push(`${field} 的图片超过 2 MB：${path}`)
}
