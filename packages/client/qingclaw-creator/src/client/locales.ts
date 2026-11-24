export const NS = 'qingclaw.creator'
export const zh = {
  local: '本机项目', emptyLocal: '当前工作区中还没有识别到插件项目。',
  scanFailed: '部分工作区读取失败，可刷新重试。',
  openPackage: '请继续开发当前工作区 {directory} 目录中的插件。',
  center: '创作者中心', packages: '我的插件',
  workspace: '选择项目目录', reload: '刷新',
  packageListEmpty: '你还没有发布到青狮 npm 的包。', loading: '加载中…', history: '版本历史',
  marketVersion: '市场当前', packageName: '包名', version: '版本', released: '发布时间', listing: '市场状态', request: '申请上架',
  unlisted: '未申请', pending: '待审核', publishing: '上架中', published: '已上架', superseded: '历史版本', rejected: '已退回',
  failed: '上架失败', delisted: '已下架', back: '返回我的插件', submitted: '已提交上架申请',
  versionBlocked: '已有同级或更高版本上架，无法上架此版本', highestListed: '历史最高上架版本',
  loadFailure: '暂时无法读取创作者数据，请稍后刷新。',
}
export type CreatorKey = keyof typeof zh
export const en: Record<CreatorKey, string> = {
  local: 'Local projects', emptyLocal: 'No plugin projects found in your workspaces.',
  scanFailed: 'Some workspaces could not be read. Refresh to retry.',
  openPackage: 'Continue development of the plugin in the {directory} directory of this workspace.',
  center: 'Creator center', packages: 'My plugins',
  workspace: 'Choose project directory', reload: 'Refresh',
  packageListEmpty: 'You have not published any packages to the QingClaw registry yet.', loading: 'Loading…', history: 'Version history',
  marketVersion: 'Market version', packageName: 'Package', version: 'Version', released: 'Published at', listing: 'Market status', request: 'Request listing',
  unlisted: 'Not submitted', pending: 'In review', publishing: 'Listing in progress', published: 'Listed', superseded: 'Superseded', rejected: 'Returned',
  failed: 'Listing failed', delisted: 'Delisted', back: 'Back to my plugins', submitted: 'Listing requested',
  versionBlocked: 'A release with the same or higher version precedence has already been listed.', highestListed: 'Highest listed version',
  loadFailure: 'Creator data is unavailable. Refresh to try again.',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.creator': CreatorKey }
}
