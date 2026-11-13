/** Runtime-safe QingClaw identity embedded in the Desktop bundles. */
export const QINGCLAW_DESKTOP_DISTRIBUTION = Object.freeze({
  productName: '青狮龙虾',
  shortName: 'QingClaw',
  protocol: 'qingclaw',
  services: Object.freeze({
    platformOrigins: Object.freeze({
      test: 'https://beta.qingclaw.com',
      production: 'https://qingclaw.com',
    }),
    inferenceOrigin: 'https://api.qingclaw.com',
  }),
} as const)
