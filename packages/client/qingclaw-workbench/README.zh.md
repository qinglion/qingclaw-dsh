---
description: "从 DSH 侧栏浏览、安装并打开青狮工作台。"
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

[English](README.md) | 中文

## 概述

从侧栏的「工作台」可进入青狮官方目录。在「市场」「我的收藏」「已安装」中，都可以按工作台名称、包名、作者或分类搜索。安装工作台后，可以打开主面板并将入口固定到侧栏。

点击卡片可查看工作台简介。如果该版本提供了 README，详情页也会显示。返回目录后，原先的标签页、搜索词和分类筛选都会保留。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在产品包中启用 Host 插件并加载其 Client 组件。Host 从 `QINGCLAW_PLATFORM_ORIGIN` 指定的官网读取 `/workbenches/index.json`，默认官网是 `https://qingclaw.com`。每个条目指定 `https://npm.qingclaw.com/` 中一个 `@qinglion` 包的确切版本及其 `panelId`。原生插件管理器负责安装并提供安装状态。插件注册对应的 `main` 面板后即可直接打开。已安装且已加载的面板会自动出现在侧栏，可通过侧栏自带的按钮固定或隐藏。开启缓存后，客户端离线时可用同一官网上次通过校验的目录恢复已有面板。安装新工作台需要在线目录。

已有集成可以继续调用 `getFeed(refresh)` 读取 Feed v1，默认地址为 `https://qingclaw.com/api/workbench-feed`。刷新失败时，该接口可返回上次通过校验的内容。将 `cacheFile` 配置为仅当前用户可访问的绝对路径，即可跨重启保留这份缓存。`feedUrl` 可覆盖旧版 Feed 的地址。目录和 Feed 共用 `cacheTtlMs`、`fetchTimeoutMs` 和 `maxResponseBytes` 配置。

<a id="model-experience"></a>
## 模型体验

无。工作台目录与面板导航均在模型上下文之外运行。

#### KV Cache 影响

无。读取目录或 Feed 不会增加模型请求的 token 数。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 收藏保存在当前客户端的浏览器本地存储中。
- 工作台包已经安装、主面板尚未就绪时，页面会显示「重启后打开」。

<a id="dev-note"></a>
### 开发备注

读取工作台目录请调用 `getWorkbenchCatalog(refresh)`。展示学习内容的已有集成依赖 `getFeed(refresh)` 的响应格式，后续修改应保持兼容。
