/** Runtime-safe QingClaw identity embedded in the Desktop bundles. */
export const QINGCLAW_DESKTOP_DISTRIBUTION = Object.freeze({
  productName: '青狮龙虾',
  shortName: 'QingClaw',
  protocol: 'qingclaw',
  welcome: Object.freeze({
    description: '律师 AI 助理，就用青狮龙虾',
    apiKeyLogin: false,
  }),
  services: Object.freeze({
    platformOrigins: Object.freeze({
      test: 'https://beta.qingclaw.com',
      production: 'https://qingclaw.com',
    }),
    inferenceOrigin: 'https://api.qingclaw.com',
  }),
} as const)
