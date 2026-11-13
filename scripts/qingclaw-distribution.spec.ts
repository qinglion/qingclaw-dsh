import { describe, expect, it } from 'vitest'
import { QINGCLAW_DISTRIBUTION } from '../distribution/qingclaw.mjs'

describe('QingClaw distribution identity', () => {
  it('keeps product, runtime, desktop, and Web identity in one descriptor', () => {
    expect(QINGCLAW_DISTRIBUTION).toMatchObject({
      productName: '青狮龙虾',
      shortName: 'QingClaw',
      clientTitle: '青狮龙虾',
      runtime: { builtInBundles: ['@deepseek-ai/dsh-qingclaw-bundle'] },
      desktop: {
        appId: 'com.qinglion.qingclaw',
        protocol: 'qingclaw',
        protocolName: '青狮龙虾',
        artifactPrefix: 'qingclaw',
        services: {
          platformOrigins: {
            test: 'https://beta.qingclaw.com',
            production: 'https://qingclaw.com',
          },
          inferenceOrigin: 'https://api.qingclaw.com',
        },
      },
      web: {
        manifest: { name: '青狮龙虾', shortName: 'QingClaw', themeColor: '#10B981' },
      },
    })
  })

  it('is immutable at every public branch', () => {
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.runtime)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.runtime.builtInBundles)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.desktop)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.desktop.services)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.desktop.services.platformOrigins)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.web)).toBe(true)
    expect(Object.isFrozen(QINGCLAW_DISTRIBUTION.web.manifest)).toBe(true)
  })

  it('contains no upstream user-facing identity or credential-shaped fields', () => {
    const userFacingIdentity = JSON.stringify({
      productName: QINGCLAW_DISTRIBUTION.productName,
      shortName: QINGCLAW_DISTRIBUTION.shortName,
      clientTitle: QINGCLAW_DISTRIBUTION.clientTitle,
      desktop: QINGCLAW_DISTRIBUTION.desktop,
      web: QINGCLAW_DISTRIBUTION.web,
    })
    expect(userFacingIdentity).not.toMatch(/DeepSeek/iu)
    expect(Object.keys(QINGCLAW_DISTRIBUTION).join(' ')).not.toMatch(/secret|token|password|private.?key/iu)
  })
})
