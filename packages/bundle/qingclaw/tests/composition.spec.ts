import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

interface BundleManifest {
  dsh?: { bundle?: { patch?: string | string[] } }
}

/** Load every patch declared by one bundle manifest through the production parser. */
function bundle(name: 'base' | 'web-app' | 'qingclaw') {
  const directory = join(REPOSITORY_ROOT, 'packages', 'bundle', name)
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as BundleManifest
  const declared = manifest.dsh?.bundle?.patch
  if (declared === undefined) throw new Error(`Bundle ${name} declares no patch`)
  return (typeof declared === 'string' ? [declared] : declared).flatMap(file =>
    loadOverlayPatches('QingClaw bundle composition test', join(directory, file)))
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
    expect(composed).toHaveLength(web.length + 4)
    expect(composed.find(row => row.id === 'ui-brand-official')).toMatchObject({
      name: '@deepseek-ai/dsh-client-ui-brand-official',
      disabled: true,
    })
    expect(composed.find(row => row.id === 'ui-brand-qingclaw')?.name)
      .toBe('@deepseek-ai/dsh-client-ui-brand-qingclaw')
    expect(composed.find(row => row.id === 'ui-account-notifications')?.disabled).toBe(true)
    expect(composed.find(row => row.id === 'ui-settings-account')?.config).toEqual({
      desktopOnboarding: false,
      allowApiKey: false,
    })

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
    expect(composed.find(row => row.id === 'llm-deepseek')?.disabled).toBe(true)
    expect(composed.find(row => row.id === 'agent-default-model')?.config).toEqual({
      provider: 'deepseek-account',
      model: 'qwen-plus',
      reasoningEffort: 'high',
    })
    const systemPrompt = composed.find(row => row.id === 'system-prompt')?.config as Record<string, unknown> | undefined
    expect(systemPrompt?.includeHarnessIdentity).toBe(false)
    expect(String(systemPrompt?.personaPrefix)).toContain('青狮龙虾')
    expect(composed.find(row => row.id === 'workspace-controller')?.config).toEqual({
      defaultWorkspaceParent: 'qingclaw',
    })
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

  it('layers QingClaw Web policy over the complete upstream preset roster', () => {
    const upstream = composeEntries([bundle('base'), bundle('web-app')])
    const qingclaw = composeEntries([bundle('base'), bundle('web-app'), bundle('qingclaw')])

    expect(qingclaw.find(row => row.id === 'qingclaw-distribution')).toMatchObject({
      name: '@deepseek-ai/dsh-qingclaw-bundle',
    })
    for (const id of ['preset-standard', 'preset-ptc', 'preset-cordis']) {
      const upstreamPreset = upstream.find(row => row.id === id)
      const qingclawPreset = qingclaw.find(row => row.id === id)
      expect(qingclawPreset?.config).toEqual(upstreamPreset?.config)
      const config = qingclawPreset?.config as { plugins?: { id?: string; config?: Record<string, unknown> }[] } | undefined
      const web = config?.plugins?.find(row => row.id === 'tool-web')
      expect(web?.config).toMatchObject({ fetch: true })
    }

    const minimal = qingclaw.find(row => row.id === 'preset-minimal')
    const minimalConfig = minimal?.config as { plugins?: { id?: string }[] } | undefined
    expect(minimalConfig?.plugins?.some(row => row.id === 'tool-web')).toBe(false)
  })

  it('disables upstream DeepSeek telemetry and request metadata only in QingClaw', () => {
    const telemetryRows = [
      ['desktop-product-telemetry', '@deepseek-ai/dsh-host-product-telemetry-otel'],
      ['product-analytics', '@deepseek-ai/dsh-client-product-analytics'],
      ['session-telemetry-otel', '@deepseek-ai/dsh-session-telemetry-otel'],
      ['ui-settings-session-log', '@deepseek-ai/dsh-client-ui-settings-session-log'],
      ['session-log-deepseek', '@deepseek-ai/dsh-session-log-deepseek'],
      ['plugin-package-inventory-deepseek', '@deepseek-ai/dsh-plugin-package-inventory-deepseek'],
    ] as const

    const upstream = composeEntries([bundle('base'), bundle('web-app')])
    const qingclaw = composeEntries([bundle('base'), bundle('web-app'), bundle('qingclaw')])

    for (const [id, name] of telemetryRows) {
      const upstreamRow = upstream.find(row => row.id === id)
      const qingclawRow = qingclaw.find(row => row.id === id)

      expect(upstreamRow).toMatchObject({ name })
      expect(upstreamRow?.disabled).not.toBe(true)
      expect(qingclawRow).toMatchObject({
        name,
        disabled: true,
      })
      expect(qingclawRow?.config).toEqual(upstreamRow?.config)
    }
  })
})
