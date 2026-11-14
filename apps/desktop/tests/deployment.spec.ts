import { describe, expect, it } from 'vitest'
import { qingclawDesktopDeployment } from '../src/deployment.ts'
import { QINGCLAW_DESKTOP_DISTRIBUTION } from '../src/distribution.ts'
import { QINGCLAW_DISTRIBUTION } from '../../../distribution/qingclaw.mjs'

describe('QingClaw packaged service deployment', () => {
  it('keeps the packaged runtime origins aligned with the release descriptor', () => {
    expect(QINGCLAW_DESKTOP_DISTRIBUTION.services).toEqual(QINGCLAW_DISTRIBUTION.desktop.services)
  })

  it.each([
    ['test', 'https://beta.qingclaw.com'],
    ['production', 'https://qingclaw.com'],
  ] as const)('accepts the sealed %s public origins', (name, platformOrigin) => {
    const deployment = qingclawDesktopDeployment({
      qingclawDesktopDeployment: name,
      qingclawPlatformOrigin: platformOrigin,
      qingclawInferenceOrigin: 'https://api.qingclaw.com',
    })
    expect(deployment).toEqual({
      name,
      platformOrigin,
      inferenceOrigin: 'https://api.qingclaw.com',
      environment: {
        QINGCLAW_PLATFORM_ORIGIN: platformOrigin,
        QINGCLAW_INFERENCE_ORIGIN: 'https://api.qingclaw.com',
      },
    })
    expect(Object.isFrozen(deployment)).toBe(true)
    expect(Object.isFrozen(deployment.environment)).toBe(true)
  })

  it.each([
    undefined,
    null,
    {},
    { qingclawDesktopDeployment: 'beta', qingclawPlatformOrigin: 'https://beta.qingclaw.com', qingclawInferenceOrigin: 'https://api.qingclaw.com' },
    { qingclawDesktopDeployment: 'test', qingclawPlatformOrigin: 'https://qingclaw.com', qingclawInferenceOrigin: 'https://api.qingclaw.com' },
    { qingclawDesktopDeployment: 'production', qingclawPlatformOrigin: 'https://qingclaw.com/path', qingclawInferenceOrigin: 'https://api.qingclaw.com' },
    { qingclawDesktopDeployment: 'production', qingclawPlatformOrigin: 'https://qingclaw.com', qingclawInferenceOrigin: 'https://other.example.com' },
  ])('rejects missing, mixed, or unknown metadata %#', (manifest) => {
    expect(() => qingclawDesktopDeployment(manifest)).toThrow('invalid deployment metadata')
  })
})
