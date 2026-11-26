---
name: qingclaw-plugin-publish
description: 创作者通过自然语言或发布请求，把插件、工作台或技能的新版本发布到青狮私有 npm，并提交版本改动。
---

# 发布到青狮 npm

1. 用户明确要求发布时，定位当前会话目录中对应的包目录：包就在会话目录时用 .，子目录（集合型工作区、分支工作树）用相对路径，写成 dsh-codex、./dsh-codex 都行。核对 package.json 的 @qinglion 包名，以及工作台的 qingclaw.workbench.panelId。同时确认上架元数据齐全：qingclaw.name.zh 与 qingclaw.description.zh 非空；工作台还要 qingclaw.workbench.icon 和至少两张 qingclaw.workbench.previews，图片写在包内（如 ./assets/workbench/icon.webp），单张不超过 2 MB；可选 qingclaw.links（1 至 8 个 https 链接；视频号这类抓不到预览的页面写成 { url, title, image }，image 用包内图片）。工作区里有多个插件且用户没有指名时，先用文件工具列出候选并请用户选择，再把选中的目录传给工具。
2. 递增版本号：默认把 patch 加一（2.7.7 → 2.7.8，预发布后缀一并去掉）；用户指定了版本号或要求 minor / major 时按用户说的。同步锁文件里的版本字段（package-lock.json 通常有两处，pnpm 项目则改 pnpm-lock.yaml）。除非用户明确要求，不改造当前已发布的那个版本。
3. 按项目的脚本构建和测试。在选定的包目录运行 npm pack --dry-run --json --ignore-scripts 并核对文件，确认要分发的文件齐全，排除本地配置和密钥。单个归档（含工作台预览图）不得超过 100 MB，和私服请求上限一致；超了先精简包内容再发。
4. 在同一目录执行 npm pack --json --ignore-scripts。用输出中的 filename、version、name、integrity 调用 qingclaw_publish_package，account 取本技能末尾的当前账号标识。directory 可省略：工具会复用本会话上次发布的目录，再否则按包名和版本定位唯一目录；同深度多个候选时先传选定的相对目录（会话目录本身为 .）。发布工具自动使用青狮登录态。发包使用此工具，不使用 shell 运行 npm login 或 npm publish，也不要读写任何 npm 登录凭据。
5. 发布成功后提交并推送这次版本改动：只把该包目录里版本相关与本次发布需要的文件加入，提交信息写成 `release(<包名>): <版本>`，然后推送到该仓库当前跟踪的远端分支。用户明确说不要提交或不要推送时才跳过，并说明跳过了什么。
6. 发布需要已开通专业版的账号；平台不签发发布授权时，工具会提示"发布插件需要专业版"，据实告知用户去升级即可。根据工具核实的结果报告包名、版本、提交与推送结果；同版本同内容算已发布。发布后到「工作台发布」或「创作者中心 → 我的插件」选定该版本申请上架。
