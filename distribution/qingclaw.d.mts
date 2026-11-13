/** QingClaw's public, compile-time product and distribution identity. */
export interface QingClawDistribution {
  readonly productName: '青狮龙虾'
  readonly shortName: 'QingClaw'
  readonly clientTitle: '青狮龙虾'
  readonly runtime: {
    readonly builtInBundles: readonly ['@deepseek-ai/dsh-qingclaw-bundle']
  }
  readonly desktop: {
    readonly appId: 'com.qinglion.qingclaw'
    readonly protocol: 'qingclaw'
    readonly protocolName: '青狮龙虾'
    readonly artifactPrefix: 'qingclaw'
    readonly microphoneUsageDescription: string
  }
  readonly web: {
    readonly appleMobileWebAppTitle: '青狮龙虾'
    readonly manifest: {
      readonly name: '青狮龙虾'
      readonly shortName: 'QingClaw'
      readonly themeColor: '#10B981'
      readonly backgroundColor: '#ffffff'
    }
  }
}

export declare const QINGCLAW_DISTRIBUTION: Readonly<QingClawDistribution>

export default QINGCLAW_DISTRIBUTION
