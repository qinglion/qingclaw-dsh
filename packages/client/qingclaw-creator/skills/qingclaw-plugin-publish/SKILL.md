---
name: qingclaw-plugin-publish
description: 创作者通过自然语言或会话顶部的发布按钮，将插件、工作台或技能的指定版本发布到青狮私有 npm。
---

# 发布到青狮 npm

1. 用户明确要求发布时，定位当前工作区中对应的包。核对 package.json 的 @qinglion 包名和确切版本、多包工作区的子目录，以及工作台的 qingclaw.workbench.panelId。多个候选且目标不明确时请用户选择。
2. 按项目的脚本先构建和测试。在选定的包目录运行 npm pack --dry-run --json --ignore-scripts 并核对文件，确认要分发的文件齐全，排除本地配置和密钥。
3. 在同一目录执行 npm pack --json --ignore-scripts。用输出中的 filename、version、name、integrity 和工作区相对目录（根目录为 .）调用 qingclaw_publish_package，account 取本技能末尾的当前账号标识。发布工具自动使用青狮登录态。发包使用此工具，不使用 shell 运行 npm login 或 npm publish，也不要读写任何 npm 登录凭据。
4. 根据工具核实的结果报告包名、版本；同版本同内容算已发布。同一版本已存在但内容不同时先告知用户，更新版本需要用户选定。发布后可到「创作者中心 → 我的插件」选定版本申请上架。
