---
description: "为 DSH 共用浏览器外壳提供青狮龙虾侧栏与空白会话首页品牌填充。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-qingclaw

[English](README.md) | 中文

## 概述

本包向 DSH 共用 Web 外壳提供青狮龙虾双层产品标志、由 locale 管理的产品名，以及首帧启动画面。Web 与 Desktop 使用同一套浏览器外壳，因此一个包即可为两个端完成品牌化，无需改动页面组件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在侧栏与会话包之后，把本包作为浏览器插件加载。青狮龙虾发行 bundle 会为正式青狮构建完成这层组合。它替换侧栏标志、侧栏名称以及空白会话标题旁的标志，并由 host 半部用青狮龙虾启动画面盖住外壳自带的加载卡片。两层错位的青狮图形在保留产品家族几何与配色的同时区分青狮龙虾。图形本身来自 [ui-primitives](../ui-primitives/README.zh.md#component-catalog) 的共享 `QingClawMark` 组件，因此品牌席位与 Chat 运行状态行绘制同一份几何。

-----

<a id="understand-the-implementation"></a>
## 理解实现

浏览器半部注册一组 locale 字典，并通过嵌套、感知声明的 slot 注入等待三个品牌 slot 全部出现，然后把标志、名称和首屏标志作为一组安装。任一声明消失时整组填充都会撤回，重新声明后整组恢复，因此热重载期间不会留下混合品牌。

host 半部贡献两条 `webserver/index-inject` 行：一条 head 样式表与一条 body 脚本。外壳的加载卡片要等应用模块执行后才绘制，因此启动画面必须比任何客户端插件都早；注入的样式在解析 head 期间就画出品牌底色，脚本则在应用模块执行前挂载标志与名称。两者都限定在 `#qingclaw-boot` 作用域内，不向应用添加任何规则。启动画面至少停留 `minVisibleMs`（默认 2.4 秒），让快速启动也能演完入场；随后当 `#root` 中出现外壳启动节点之外的节点、或该节点丢掉 spinner 切换到外壳自己的失败报告、或超过 `timeoutMs` 上限（默认 60 秒）时，以 320ms 淡出退场。启动超过 1.6 秒时，状态行上方出现一条极细进度条：它跟随 loader 名单中已激活的比例，读不到该比例时退化为不确定的流动光带。两个时间都是校验过的 `Config` 字段。

-----

<a id="further-exploration"></a>
## 进一步探索

- [青狮龙虾发行 bundle](../../bundle/qingclaw/README.zh.md)——用本插件替换随附的官方品牌行。
- [ui-sidebar](../ui-sidebar/README.zh.md)——持有侧栏品牌 slot 与周边交互。
- [ui-conversation](../ui-conversation/README.zh.md)——持有空白会话首屏标志 slot。

-----

<a id="model-experience"></a>
## 模型体验

### 浏览器品牌

#### 模型看到什么

无。本包只贡献 `sidebar.brand.mark`、`sidebar.brand.name` 和 `conversation.hero.brand.mark` 浏览器 slot，不增加提示词、工具或会话事件。

#### Token 影响

本插件增加零 Token，因为它的 slot 贡献仅在浏览器中渲染。

#### KV Cache 影响

本插件不改变请求前缀，因此不影响 KV Cache。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 浏览器文档标题、原生应用身份、签名和更新地址属于构建期发行事项，不在运行时 Client slot 范围内。
- 启动画面以注入字符串而非 CSS Module 与 React 组件存在，因为它必须早于模块图；其样式由本包自己的断言覆盖，不走客户端样式表门禁。
- 青狮龙虾 2.0 第一阶段不迁移青狮龙虾 1.0 本地数据，也不集成原有免费和付费技能目录。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本包在此 fork 内构建和发布时有意遵循现有 DSH 包命名空间；用户可见的公开身份始终是青狮龙虾。

</details>
