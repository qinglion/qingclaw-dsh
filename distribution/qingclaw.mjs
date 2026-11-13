/**
 * Recursively freeze a public distribution descriptor.
 *
 * This module deliberately contains no credentials. Signing, notarization,
 * storage, and CDN secrets remain CI-owned environment values.
 *
 * @template {object} T
 * @param {T} value - Descriptor branch to freeze.
 * @returns {Readonly<T>} the frozen branch.
 */
function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child)
  }
  return Object.freeze(value)
}

/** QingClaw's public, compile-time product and distribution identity. */
export const QINGCLAW_DISTRIBUTION = deepFreeze({
  productName: '青狮龙虾',
  shortName: 'QingClaw',
  clientTitle: '青狮龙虾',
  runtime: {
    builtInBundles: ['@deepseek-ai/dsh-qingclaw-bundle'],
  },
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
    microphoneUsageDescription: '青狮龙虾使用麦克风将语音转换为消息草稿。',
  },
  web: {
    appleMobileWebAppTitle: '青狮龙虾',
    manifest: {
      name: '青狮龙虾',
      shortName: 'QingClaw',
      themeColor: '#10B981',
      backgroundColor: '#ffffff',
    },
  },
})

export default QINGCLAW_DISTRIBUTION
