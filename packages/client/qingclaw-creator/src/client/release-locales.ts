export const releaseNamespace = 'qingclaw.creator.release'
export const zh = {
  workspace: '工作区', created: '工作区创建时间', release: '发布', publish: '发布到青狮 npm', sending: '正在发送…', project: '项目详情',
  history: '发布历史', refresh: '刷新', packageName: 'npm 包', path: '目录', version: '开发版本',
  author: '作者', kind: '类型', plugin: '插件', workbench: '工作台', skill: '技能', panel: '侧栏面板',
  select: '选择要发布的项目', noHistory: '私服里还没有这个包的发布记录。',
  loading: '正在读取发布历史…', loadFailed: '发布历史暂时无法读取。', sendFailed: '未能发送发布请求，请重试。',
  pending: '待审核', published: '已上架', superseded: '历史版本', publishing: '上架中', rejected: '已退回', failed: '上架失败',
  unlisted: '未上架', withdrawn: '已下架',
  creator_required: '请使用具备创作者权限的青狮账号发布。',
  changed: '项目已发生变化，请重新选择后发布。',
}
export const en: Record<keyof typeof zh, string> = {
  workspace: 'Workspace', created: 'Workspace created', release: 'Publish', publish: 'Publish to QingClaw npm', sending: 'Sending…', project: 'Project details',
  history: 'Release history', refresh: 'Refresh', packageName: 'npm package', path: 'Directory', version: 'Local version',
  author: 'Author', kind: 'Type', plugin: 'Plugin', workbench: 'Workbench', skill: 'Skill', panel: 'Sidebar panel',
  select: 'Project to publish', noHistory: 'No versions of this package have been published to the registry yet.',
  loading: 'Loading release history…', loadFailed: 'Release history is unavailable.', sendFailed: 'Could not send the release request. Try again.',
  pending: 'In review', published: 'Listed', superseded: 'Superseded', publishing: 'Listing', rejected: 'Returned', failed: 'Listing failed',
  unlisted: 'Not listed', withdrawn: 'Delisted',
  creator_required: 'Sign in with a QingClaw account with creator access to publish.',
  changed: 'The project has changed. Select the version again before publishing.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.creator.release': keyof typeof zh }
}
