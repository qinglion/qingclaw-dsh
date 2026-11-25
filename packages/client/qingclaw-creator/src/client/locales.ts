export const NS = 'qingclaw.creator'
export const zh = {
  local: '本机项目', noWorkspaces: '还没有工作区，请先打开一个目录。',
  unrecognizedRoot: '会话目录的根目录未识别到插件。',
  scanFailed: '部分工作区读取失败，可刷新重试。',
  center: '创作者中心', packages: '我的插件', publish: '发布',
  publishDescription: '把这个会话目录里的插件包发布到青狮 npm',
  publishDirectory: '子目录，如 dsh-codex', publishUse: '使用该目录', publishChange: '更换目录',
  publishMissing: '该目录里没有可发布的插件包。',
  publishEmpty: '已注册的工作区里没有找到可发布的插件包。',
  reload: '刷新', history: '版本历史', packageListEmpty: '你还没有发布到青狮 npm 的包。', loading: '加载中…',
  marketVersion: '市场当前', request: '申请上架',
  unlisted: '未申请', pending: '待审核', publishing: '上架中', published: '已上架', superseded: '历史版本', rejected: '已退回',
  failed: '上架失败', delisted: '已下架', back: '返回我的插件', submitted: '已提交上架申请',
  versionBlocked: '已有同级或更高版本上架，无法上架此版本', highestListed: '历史最高上架版本',
  loadFailure: '暂时无法读取创作者数据，请稍后刷新。',
}
export type CreatorKey = keyof typeof zh
export const en: Record<CreatorKey, string> = {
  local: 'Local projects', noWorkspaces: 'No workspaces yet. Open a directory first.',
  unrecognizedRoot: 'No plugin was found at the root of the session directory.',
  scanFailed: 'Some workspaces could not be read. Refresh to retry.',
  center: 'Creator center', packages: 'My plugins', publish: 'Publish',
  publishDescription: 'Publish the plugin package of this session directory to QingClaw npm',
  publishDirectory: 'Subdirectory, for example dsh-codex', publishUse: 'Use this directory', publishChange: 'Change directory',
  publishMissing: 'That directory holds no publishable plugin package.',
  publishEmpty: 'No publishable plugin package was found in the registered workspaces.',
  reload: 'Refresh', history: 'Version history', packageListEmpty: 'You have not published any packages to the QingClaw registry yet.', loading: 'Loading…',
  marketVersion: 'Market version', request: 'Request listing',
  unlisted: 'Not submitted', pending: 'In review', publishing: 'Listing in progress', published: 'Listed', superseded: 'Superseded', rejected: 'Returned',
  failed: 'Listing failed', delisted: 'Delisted', back: 'Back to my plugins', submitted: 'Listing requested',
  versionBlocked: 'A release with the same or higher version precedence has already been listed.', highestListed: 'Highest listed version',
  loadFailure: 'Creator data is unavailable. Refresh to try again.',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.creator': CreatorKey }
}
