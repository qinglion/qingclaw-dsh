---
name: qingclaw-plugin-publish
description: 创作者通过自然语言或发布请求，将插件、工作台或技能的指定版本发布到青狮私有 npm。
---

# 发布到青狮 npm

1. 用户明确要求发布时，定位当前会话目录中对应的包目录：包就在会话目录时用 .，子目录（集合型工作区、分支工作树）用相对路径。核对 package.json 的 @qinglion 包名和确切版本，以及工作台的 qingclaw.workbench.panelId。同时确认上架元数据齐全：qingclaw.name.zh 与 qingclaw.description.zh 非空；工作台还要 qingclaw.workbench.icon 和至少两张 qingclaw.workbench.previews，图片写在包内（如 ./assets/workbench/icon.webp），单张不超过 2 MB。发布工具会拒绝缺少这些字段的归档，因为这样的版本无法上架目录。工作区里有多个插件且用户没有指名时，先用文件工具列出候选并请用户选择，再把选中的目录传给工具。
2. 按项目的脚本先构建和测试。在选定的包目录运行 npm pack --dry-run --json --ignore-scripts 并核对文件，确认要分发的文件齐全，排除本地配置和密钥。单个归档（含工作台预览图）不得超过 25 MB，和私服请求上限一致；超了先精简包内容再发。
3. 在同一目录执行 npm pack --json --ignore-scripts。用输出中的 filename、version、name、integrity 调用 qingclaw_publish_package，account 取本技能末尾的当前账号标识。directory 可省略：工具会复用本会话上次发布的目录，再否则按包名和版本定位唯一目录；同深度多个候选时先传选定的相对目录（会话目录本身为 .）。发布工具自动使用青狮登录态。发包使用此工具，不使用 shell 运行 npm login 或 npm publish，也不要读写任何 npm 登录凭据。
4. 根据工具核实的结果报告包名、版本；同版本同内容算已发布。同一版本已存在但内容不同时先告知用户，更新版本需要用户选定。发布后可到「创作者中心 → 我的插件」选定版本申请上架。
