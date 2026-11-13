import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Load one bundle patch through the production profile parser. */
function bundle(name: 'base' | 'web-app' | 'qingclaw') {
  return loadOverlayPatches(
    'QingClaw bundle composition test',
    join(REPOSITORY_ROOT, 'packages', 'bundle', name, 'cordis.patch.yml'),
  )
}

describe('QingClaw distribution bundle', () => {
  it('declares the QingClaw account and workbench plugins as production dependencies', () => {
    const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'packages/bundle/qingclaw/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies?.['@qinglion/dsh-llm-qingclaw-account']).toBe('workspace:*')
    expect(manifest.dependencies?.['@qinglion/dsh-qingclaw-workbench']).toBe('workspace:*')
    expect(manifest.dependencies?.['@deepseek-ai/dsh-client-ui-brand-official']).toBe('workspace:*')
  })

  it('owns account origins and brand rows without copying the upstream roster', () => {
    const web = composeEntries([bundle('base'), bundle('web-app')])
    expect(web.find(row => row.id === 'ui-brand-official')?.name)
      .toBe('@deepseek-ai/dsh-client-ui-brand-official')

    const composed = composeEntries([bundle('base'), bundle('web-app'), bundle('qingclaw')])
    expect(composed).toHaveLength(web.length + 3)
    expect(composed.find(row => row.id === 'ui-brand-official')).toMatchObject({
      name: '@deepseek-ai/dsh-client-ui-brand-official',
      disabled: true,
    })
    expect(composed.find(row => row.id === 'ui-brand-qingclaw')?.name)
      .toBe('@deepseek-ai/dsh-client-ui-brand-qingclaw')
    expect(composed.find(row => row.id === 'ui-account-notifications')?.disabled).toBe(true)

    const account = composed.find(row => row.id === 'deepseek-account')
    expect(account?.name).toBe('@deepseek-ai/dsh-deepseek-account')
    const accountConfig = account?.config as Record<string, unknown> | undefined
    expect(Object.keys(accountConfig ?? {}).sort()).toEqual([
      'desktopPlatform', 'harnessOrigin', 'inferenceOrigin', 'platformOrigin',
    ])
    expect(accountConfig?.inferenceOrigin).toEqual({
      __jsExpr: "process.env.QINGCLAW_PLATFORM_ORIGIN || 'https://qingclaw.com'",
    })

    expect(composed.find(row => row.id === 'llm-deepseek-account')?.disabled).toBe(true)
    const model = composed.find(row => row.id === 'llm-qingclaw-account')
    expect(model?.name).toBe('@qinglion/dsh-llm-qingclaw-account')
    const modelConfig = model?.config as Record<string, unknown> | undefined
    expect(Object.keys(modelConfig ?? {}).sort()).toEqual(['baseURL', 'maxTokens'])
    expect(modelConfig?.maxTokens).toBe(8_192)

    const workbench = composed.find(row => row.id === 'qingclaw-workbench')
    expect(workbench?.name).toBe('@qinglion/dsh-qingclaw-workbench')
    const workbenchConfig = workbench?.config as Record<string, unknown> | undefined
    expect(Object.keys(workbenchConfig ?? {})).toEqual(['cacheFile'])
    expect(workbenchConfig?.cacheFile).toEqual({
      __jsExpr: "dshPath('cache', 'qingclaw-workbench', 'feed.json')",
    })
  })

  it('keeps device sessions away from web backends while preserving anonymous fetch', () => {
    const composed = composeEntries([bundle('base'), bundle('web-app'), bundle('qingclaw')])

    expect(composed.find(row => row.id === 'web')?.config).toEqual({ fetchProvider: 'http' })
    expect(composed.find(row => row.id === 'web-search-deepseek')).toMatchObject({
      name: '@deepseek-ai/dsh-web-search-deepseek',
      disabled: true,
    })
    expect(composed.find(row => row.id === 'web-deepseek-api')).toMatchObject({
      name: '@deepseek-ai/dsh-web-deepseek-api',
      disabled: true,
    })
    expect(composed.find(row => row.id === 'web-fetch-http')).toMatchObject({
      name: '@deepseek-ai/dsh-web-fetch-http',
    })
    expect(composed.find(row => row.id === 'web-fetch-http')?.disabled).not.toBe(true)
  })
})
