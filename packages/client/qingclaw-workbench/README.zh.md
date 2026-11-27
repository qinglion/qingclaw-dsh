---
description: "从 DSH 侧栏浏览、安装并打开青狮工作台。"
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

[English](README.md) | 中文

## 概述

从侧栏的「工作台」可进入青狮官方目录。在「市场」「我的收藏」「已安装」中，都可以按工作台名称、包名、作者或分类搜索。安装工作台后，可以打开主面板并将入口固定到侧栏。

点击卡片进入类似应用商店的产品页：只有工作台简介和可左右滑动的截图，点任意截图可以放大查看。返回目录后，原先的标签页、搜索词和分类筛选都会保留。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在产品包中启用 Host 插件并加载其 Client 组件。Host 从 `QINGCLAW_PLATFORM_ORIGIN` 指定的官网读取 `/workbenches/index.json`，默认官网是 `https://qingclaw.com`。每个条目指定 `https://npm.qingclaw.com/` 中一个 `@qinglion` 包的确切版本及其 `panelId`。该私有 npm 只对持有有效专业版授权的账号开放（`plan` 为 `pro`、未到期，且钱包里仍有对应的订阅）：免费账号拿不到读取授权，Host 也就换不到那个短期 npm 令牌，因此读不了工作台 README、也无法通过原生插件管理器安装。免费账号仍可浏览目录和查看公开的预览图。已登录但没有有效授权时，市场卡片把「安装」换成「升级到专业版」，点击打开官网出售订阅的页面（与账号里的充值同一个页面），返回后重新读取授权，授权生效后同一张卡片即可安装或更新。读取 README 或安装被拒绝时仍会提示需要专业版。令牌只留在 Host 进程内。插件注册对应的 `main` 面板后即可直接打开。已安装且已加载的面板会自动出现在侧栏，可通过侧栏自带的按钮固定或隐藏。开启缓存后，客户端离线时可用同一官网上次通过校验的目录恢复已有面板。安装新工作台需要在线目录。

当目录发布了比已安装版本更新的版本时，条目会提供「更新到该版本」，并用同一份私服授权重新安装。工作台详情页可以卸载，和插件页一样先弹出确认；卸载后列表立即按未安装展示，不再等运行中的清单追上来。详情页用操作按钮表达状态，不再重复「已安装」，并提供与插件页一致的启用开关；列表里有更新时也不显示已安装标签。停用的工作台仍算已安装：卡片显示「已停用」且不能打开。安装、更新、卸载、启停或收藏失败时，错误以浮窗提示显示在窗口顶部，由外壳 overlay 承载，因此切到别的面板也不会丢失；卡片上方不再插入横幅。只有目录读取失败仍在列表上保留可重试的提示。

安装与更新在 Host 内运行，状态保存在客户端 store 中：切换页面或重载客户端不会中断安装，也不会丢失进度。运行期间卡片与详情页显示「下载」「安装」两条进度条，数值解析自管理器的安装日志：pnpm 尚未报告数量时下载条为不确定态，随后按包拉取与链接的百分比推进，组合包启用阶段显示「启用中」。安装途中挂载的客户端通过 `getActiveInstalls()` 接管该安装，并等待管理器的 `waitForInstall(requestId)`，而不是再发起一次安装；发起安装的客户端提供的 `requestId` 用于关联管理器的 `install-state` 与 `install-log` 事件。

插件可以用同一个 ID 注册 `main` 主面板和 `sidebar.panellist` 侧栏入口，方便上架前在本地打开。把这个 ID 填入 `package.json` 的 `qingclaw.workbench.panelId`。已上架的插件如果只注册了主面板，官方目录也会为它补上侧栏入口。

每个上架版本都要在 `qingclaw` 中声明目录元数据：多语言的 `name` 与 `description`（当前必须提供中文 `zh`）；工作台还要提供 `workbench.icon` 和至少两张 `workbench.previews` 图片路径。图片随包分发（例如 `./assets/workbench/icon.svg`），图标和预览图可以是目录能提供的任意图片类型，包括 SVG、PNG、WebP 与 JPEG；创作者不需要官网仓库的写权限；上架时官网把图片存进配置好的对象存储（生产是 COS），目录从那里提供。缺少声明的字段或文件时上架申请会被拒绝并指出缺的是什么，目录按该版本声明的 `iconUrl` 与 `previews` 让侧栏入口和详情页展示它们。

版本还可以在 `qingclaw.links` 里声明最多 8 个相关资源链接（例如视频号内容）。链接可以只写网址，由发布时读取页面的标题和封面；也可以写成 `{ "url", "title", "image" }` 对象，从包里提供标题和封面——视频号这类页面不返回可读的预览信息，就需要这样写。详情页据此显示一张可点开原网页的资源卡片。

构建好插件后，在「插件 → 添加插件」中输入本地包目录的绝对路径并安装，然后从侧栏打开验证。需要分发时，可以用青狮的发布技能将插件发布到私有 npm。在「创作者中心 → 我的插件」选择已发布的版本，申请上架，管理员审核后，该版本会进入工作台目录。[自媒体工作台示例](https://github.com/qinglion/dsh-media-desk)

已有集成可以继续调用 `getFeed(refresh)` 读取 Feed v1，默认地址为 `https://qingclaw.com/api/workbench-feed`。刷新失败时，该接口可返回上次通过校验的内容。将 `cacheFile` 配置为仅当前用户可访问的绝对路径，即可跨重启保留这份缓存。`feedUrl` 可覆盖旧版 Feed 的地址。目录和 Feed 共用 `cacheTtlMs`、`fetchTimeoutMs` 和 `maxResponseBytes` 配置。`registry` 指定目录条目必须匹配的私有 npm，默认 `https://npm.qingclaw.com/`；只有该部署同时签发读取授权时，才应指向别的私服。

<a id="model-experience"></a>
## 模型体验

无。浏览和安装工作台只会更新目录与本机插件状态。

#### KV Cache 影响

无。读取目录或 Feed 不会增加模型请求的 token 数。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 读取工作台 README 与安装都需要有效的专业版授权：`plan` 必须是 `pro`、未到期，并且钱包里仍有对应的订阅，所以只改授权记录不会放行。免费账号拿不到私有 npm 的读取凭据，因此市场卡片提供升级入口并打开订阅页，而不是重试。
- 收藏保存在当前客户端的浏览器本地存储中。
- 工作台包已经安装、主面板尚未就绪时，页面会显示「重启后打开」。

<a id="dev-note"></a>
### 开发备注

读取工作台目录请调用 `getWorkbenchCatalog(refresh)`。展示学习内容的已有集成依赖 `getFeed(refresh)` 的响应格式，后续修改应保持兼容。安装与更新由 `installWorkbench(name, version, requestId)`、`updateWorkbench(name, version, requestId)` 在 Host 内完成，npm 令牌不进入浏览器；调用方的 `requestId` 用于管理器的进度事件与恢复，`getActiveInstalls()` 列出 Host 仍在运行的安装，供重载后的客户端接管。`getWorkbenchReadme(name, version, language)` 使用同一令牌读取压缩包。产品内的其他 Host 插件通过 `registryAuthorization(registry)` 读取私服，该接口返回账号令牌且不进入 Remote 接口。
