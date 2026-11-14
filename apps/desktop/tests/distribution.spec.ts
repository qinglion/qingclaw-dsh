import { describe, expect, it } from 'vitest'
import { QINGCLAW_DISTRIBUTION } from '../../../distribution/qingclaw.mjs'
import { QINGCLAW_DESKTOP_DISTRIBUTION } from '../src/distribution.ts'

describe('Desktop QingClaw distribution bridge', () => {
  it('keeps the bundled runtime identity aligned with the build-time descriptor', () => {
    expect(QINGCLAW_DESKTOP_DISTRIBUTION).toEqual({
      productName: QINGCLAW_DISTRIBUTION.productName,
      shortName: QINGCLAW_DISTRIBUTION.shortName,
      protocol: QINGCLAW_DISTRIBUTION.desktop.protocol,
      services: {
        platformOrigins: {
          test: QINGCLAW_DISTRIBUTION.desktop.services.platformOrigins.test,
          production: QINGCLAW_DISTRIBUTION.desktop.services.platformOrigins.production,
        },
        inferenceOrigin: QINGCLAW_DISTRIBUTION.desktop.services.inferenceOrigin,
      },
    })
    expect(Object.isFrozen(QINGCLAW_DESKTOP_DISTRIBUTION)).toBe(true)
  })
})
