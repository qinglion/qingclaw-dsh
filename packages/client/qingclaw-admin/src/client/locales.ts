export const zh = {
  connectPhone: '连接手机', pairingFailed: '连接窗口未能打开，请重试。',
  admin: '青狮管理', publications: '插件发布', creator: '创作者中心', submitTitle: '提交插件或技能', packageLabel: 'npm 包（.tgz）',
  packageHint: '在插件或技能项目中运行 npm pack，然后选择生成的 .tgz 文件（最大 25 MB）。',
  name: '市场展示名称（可选）', submit: '提交审核', review: '发布审核', mine: '我的提交', empty: '暂无提交',
  refresh: '刷新', loading: '加载中…', working: '处理中…', publish: '发布', reject: '退回', reason: '退回原因',
  pending: '待审核', publishing: '发布中', published: '已发布', failed: '发布失败', rejected: '已退回',
  users: '用户角色', search: '搜索', query: '姓名或邮箱', noUsers: '没有匹配的用户', role: '角色', save: '保存角色',
  userRole: '用户', creatorRole: '创作者', adminRole: '管理员', invalidFile: '请选择不超过 25 MB 的非空 .tgz 文件。',
  submitted: '已提交审核', queued: '发布任务已提交', returned: '已退回', saved: '已保存角色', plugin: '插件', skill: '技能',
} as const
export type QingClawAdminLocaleKey = keyof typeof zh
export const en: Record<QingClawAdminLocaleKey, string> = {
  connectPhone: 'Connect phone', pairingFailed: 'Could not open phone pairing. Try again.',
  admin: 'QingClaw management', publications: 'Plugin publishing', creator: 'Creator center', submitTitle: 'Submit a plugin or skill', packageLabel: 'npm package (.tgz)',
  packageHint: 'Run npm pack in the plugin or skill project, then select the resulting .tgz file (up to 25 MB).',
  name: 'Marketplace display name (optional)', submit: 'Submit for review', review: 'Publication review', mine: 'My submissions', empty: 'No submissions yet',
  refresh: 'Refresh', loading: 'Loading…', working: 'Working…', publish: 'Publish', reject: 'Return', reason: 'Reason for returning',
  pending: 'Pending review', publishing: 'Publishing', published: 'Published', failed: 'Failed', rejected: 'Returned',
  users: 'User roles', search: 'Search', query: 'Name or email', noUsers: 'No matching users', role: 'Role', save: 'Save role',
  userRole: 'User', creatorRole: 'Creator', adminRole: 'Administrator', invalidFile: 'Choose a nonempty .tgz file no larger than 25 MB.',
  submitted: 'Submitted for review', queued: 'Publication queued', returned: 'Returned', saved: 'Role saved', plugin: 'Plugin', skill: 'Skill',
}
