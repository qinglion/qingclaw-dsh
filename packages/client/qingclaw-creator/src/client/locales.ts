export const NS = 'qingclaw.creator'
export const zh = {
  local: '本机项目', emptyLocal: '当前工作区中还没有识别到插件项目。', folder: '项目目录名', chooseParent: '选择存放位置', open: '打开',
  scanFailed: '部分工作区读取失败，可刷新重试。', newProjectTitle: '创建插件工作区', newWorkbenchTitle: '创建工作台工作区',
  openPackage: '请继续开发当前工作区 {directory} 目录中的插件。', invalidFolder: '请使用有效的项目目录名。',
  center: '创作者中心', packages: '我的插件', newPlugin: '新建插件', newWorkbench: '新建工作台',
  openProject: '打开本地项目', workspace: '选择项目目录', reload: '刷新',
  packageListEmpty: '你还没有发布到青狮 npm 的包。', loading: '加载中…', history: '版本历史',
  marketVersion: '市场当前', packageName: '包名', version: '版本', released: '发布时间', listing: '市场状态', request: '申请上架',
  unlisted: '未申请', pending: '待审核', publishing: '上架中', published: '已上架', superseded: '历史版本', rejected: '已退回',
  failed: '上架失败', delisted: '已下架', back: '返回我的插件', submitted: '已提交上架申请',
  versionBlocked: '已有同级或更高版本上架，无法上架此版本', highestListed: '历史最高上架版本',
  cancel: '取消',
  loadFailure: '暂时无法读取创作者数据，请稍后刷新。', setupFailed: '无法打开项目目录。',
  projectPrompt: '在当前工作区开发一个青狮插件。先和我确认插件需要解决的问题，再实现并验证。',
  workbenchPrompt: '在当前工作区开发一个带侧栏主面板的青狮工作台插件。先和我确认需求，保持面板 ID 与 package.json 中的 qingclaw.workbench.panelId 一致。',
}
export type CreatorKey = keyof typeof zh
export const en: Record<CreatorKey, string> = {
  local: 'Local projects', emptyLocal: 'No plugin projects found in your workspaces.', folder: 'Project folder name', chooseParent: 'Choose parent folder', open: 'Open',
  scanFailed: 'Some workspaces could not be read. Refresh to retry.', newProjectTitle: 'Create plugin workspace', newWorkbenchTitle: 'Create workbench workspace',
  openPackage: 'Continue development of the plugin in the {directory} directory of this workspace.', invalidFolder: 'Enter a valid project folder name.',
  center: 'Creator center', packages: 'My plugins', newPlugin: 'New plugin', newWorkbench: 'New workbench',
  openProject: 'Open local project', workspace: 'Choose project directory', reload: 'Refresh',
  packageListEmpty: 'You have not published any packages to the QingClaw registry yet.', loading: 'Loading…', history: 'Version history',
  marketVersion: 'Market version', packageName: 'Package', version: 'Version', released: 'Published at', listing: 'Market status', request: 'Request listing',
  unlisted: 'Not submitted', pending: 'In review', publishing: 'Listing in progress', published: 'Listed', superseded: 'Superseded', rejected: 'Returned',
  failed: 'Listing failed', delisted: 'Delisted', back: 'Back to my plugins', submitted: 'Listing requested',
  versionBlocked: 'A release with the same or higher version precedence has already been listed.', highestListed: 'Highest listed version',
  cancel: 'Cancel',
  loadFailure: 'Creator data is unavailable. Refresh to try again.', setupFailed: 'Could not open the project directory.',
  projectPrompt: 'Develop a QingClaw plugin in this workspace. Ask me what it should do, then implement and verify it.',
  workbenchPrompt: 'Develop a QingClaw workbench plugin with a sidebar panel in this workspace. Discuss its purpose with me and use the same panel ID in the UI and in package.json under qingclaw.workbench.panelId.',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.creator': CreatorKey }
}
