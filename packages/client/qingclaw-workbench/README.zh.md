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

在产品包中启用 Host 插件并加载其 Client 组件。Host 从 `QINGCLAW_PLATFORM_ORIGIN` 指定的官网读取 `/workbenches/index.json`，默认官网是 `https://qingclaw.com`。每个条目指定 `https://npm.qingclaw.com/` 中一个 `@qinglion` 包的确切版本及其 `panelId`。该私有 npm 只对已登录的青狮账号开放，Host 用该账号的平台授权换取短期 npm 读取令牌，再据此读取工作台 README 并通过原生插件管理器安装，安装状态由插件管理器提供。令牌只留在 Host 进程内；未登录时，读取 README 与安装都会提示需要先登录。安装还需要有效的专业版授权：免费账号可以浏览目录和查看详情，安装时会提示需要升级专业版。插件注册对应的 `main` 面板后即可直接打开。已安装且已加载的面板会自动出现在侧栏，可通过侧栏自带的按钮固定或隐藏。开启缓存后，客户端离线时可用同一官网上次通过校验的目录恢复已有面板。安装新工作台需要在线目录。

插件可以用同一个 ID 注册 `main` 主面板和 `sidebar.panellist` 侧栏入口，方便上架前在本地打开。把这个 ID 填入 `package.json` 的 `qingclaw.workbench.panelId`。已上架的插件如果只注册了主面板，官方目录也会为它补上侧栏入口。

构建好插件后，在「插件 → 添加插件」中输入本地包目录的绝对路径并安装，然后从侧栏打开验证。需要分发时，可以用青狮的发布技能将插件发布到私有 npm。在「创作者中心 → 我的插件」选择已发布的版本，申请上架，管理员审核后，该版本会进入工作台目录。[自媒体工作台示例](https://github.com/qinglion/dsh-media-desk)

已有集成可以继续调用 `getFeed(refresh)` 读取 Feed v1，默认地址为 `https://qingclaw.com/api/workbench-feed`。刷新失败时，该接口可返回上次通过校验的内容。将 `cacheFile` 配置为仅当前用户可访问的绝对路径，即可跨重启保留这份缓存。`feedUrl` 可覆盖旧版 Feed 的地址。目录和 Feed 共用 `cacheTtlMs`、`fetchTimeoutMs` 和 `maxResponseBytes` 配置。`registry` 指定目录条目必须匹配的私有 npm，默认 `https://npm.qingclaw.com/`；只有该部署同时签发读取授权时，才应指向别的私服。

<a id="model-experience"></a>
## 模型体验

无。浏览和安装工作台只会更新目录与本机插件状态。

#### KV Cache 影响

无。读取目录或 Feed 不会增加模型请求的 token 数。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 读取工作台 README 需要已登录的青狮账号；安装工作台还需要有效的专业版授权，私有 npm 不提供匿名读取，产品也按套餐限制安装。
- 收藏保存在当前客户端的浏览器本地存储中。
- 工作台包已经安装、主面板尚未就绪时，页面会显示「重启后打开」。

<a id="dev-note"></a>
### 开发备注

读取工作台目录请调用 `getWorkbenchCatalog(refresh)`。展示学习内容的已有集成依赖 `getFeed(refresh)` 的响应格式，后续修改应保持兼容。安装由 `installWorkbench(name, version)` 在 Host 内完成，npm 令牌不进入浏览器；`getWorkbenchReadme(name, version, language)` 使用同一令牌读取压缩包。产品内的其他 Host 插件通过 `registryAuthorization(registry)` 读取私服，该接口返回账号令牌且不进入 Remote 接口。
