---
description: "叠加在 DSH 共用 Web 应用 bundle 之上的青狮龙虾发行 patch。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-qingclaw-bundle

[English](README.md) | 中文

## 概述

本 bundle 是青狮龙虾持有的 DSH Web 应用发行层。它保留上游 Web 组合，把账号与模型流量路由到青狮自有服务，停用尚未提供的 Platform 通知界面，并把官方浏览器品牌行替换为青狮龙虾品牌插件。桌面端和浏览器部署可以选择同一层。

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

在青狮龙虾 profile 中，把本 bundle 放在 DSH Web 应用 bundle 之后。青狮龙虾 Desktop 会把它内置进自己的 profile bundle 列表，用户无需单独安装或启用。Web 部署也可以叠加同一末层，获得完全一致的运行时品牌与青狮账号路由。

生产环境默认用 `https://qingclaw.com` 完成账号授权，用 `https://api.qingclaw.com` 完成模型推理。未打包的开发启动可以设置 `QINGCLAW_PLATFORM_ORIGIN` 和 `QINGCLAW_INFERENCE_ORIGIN`。打包后的 Desktop 不信任用户登录 shell 中的这些值：test 打包 preset 将 `https://beta.qingclaw.com` 与 `https://api.qingclaw.com` 固化在已签名的应用清单中，production preset 则固化 `https://qingclaw.com` 与同一推理来源。Desktop 在 Host 启动前校验精确的部署环境与来源组合，并在读取登录 shell 后应用它，因此环境变量不能把已打包应用的账号或模型请求重定向到其他地址。

-----

<a id="understand-the-implementation"></a>
## 理解实现

patch 定位已有的账号、模型、网页、通知与官方品牌行 id，只替换这些行的完整配置或启用状态，再插入青狮自有插件行。账号服务继续复用 DSH 的浏览器授权、本机 PKCE 回调、凭据存储和账号模型选择，青狮 Rails 平台负责实现兼容的服务端协议。账号服务的 `inferenceOrigin` 令牌释放边界会刻意留在官网来源，因此通用账号令牌消费者无法把 30 天设备会话释放给 `api.qingclaw.com`。模型 provider 单独持有网关来源，先把设备会话换成短期模型 JWT，再只向青狮网关发送 `X-DSH-Auth-Token: Bearer <model JWT>`；上游模型密钥不会到达桌面端。当前旧版 Serverless 网关使用自带的消费者 JWT 与本地非对称 JWKS 鉴权，不走该版本不支持的插件市场 `jwt-auth`/`remote_jwks` 方案。

青狮龙虾第一版会停用上游两套 DeepSeek 网页后端。它们解析的是长期账号授权，无法复用青狮模型 provider 私有的短 JWT 缓存；网关目前也还没有 `/v1/tools/search` 或 `/v1/tools/fetch` 路由。因此 `web_search` 没有内置 provider，会在发出任何外部请求前失败。匿名 `web_fetch` 仍通过 `http` provider 可用，并且不会读取账号凭据。只有在共享短令牌 seam 和网关 tools 路由都具备后，才能重新启用网关搜索；同时必须用测试保证请求携带带 `Bearer ` 前缀的模型 JWT，绝不会携带设备会话。本 bundle 不复制 Web roster。后续青狮业务能力可以作为额外插件行加入本 bundle，无需修改 DSH agent loop。

-----

<a id="further-exploration"></a>
## 进一步探索

- [青狮龙虾品牌包](../../client/ui-brand-qingclaw/README.zh.md)——持有运行时品牌填充。
- [Web 应用 bundle](../web-app/README.zh.md)——持有本层覆盖的共用 Web roster。
- [Profile bundles](../README.zh.md)——说明有序 bundle 层。

-----

<a id="model-experience"></a>
## 模型体验

### 青狮龙虾发行层

#### 模型看到什么

模型不会看到额外的提示词。选中的账号 provider 会通过青狮推理源发送请求，把鉴权保留在 `X-DSH-Auth-Token` 请求头中，并读取网关公开的模型目录。

#### Token 影响

本层增加零提示词 Token。它把青狮账号路由的默认最大输出设为 8,192，并且解析后的模型目录不会公开更大的路由上限。实际推理用量仍由所选模型与请求决定。

#### KV Cache 影响

本层不改变请求前缀，因此不影响 KV Cache。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 本 bundle 必须位于 Web 应用层之后，因为它定位后者声明的配置行。
- 青狮账号与网关服务必须保持 DSH 账号协议、`x-dsh-auth-token` 契约、模型目录结构和 Messages 流式行为兼容。网关消费者 JWT 契约使用 `Bearer ` 前缀与 `aud=qingclaw-model-gateway`。
- 8,192 Token 路由设置只是客户端默认值与目录上限，不是安全边界。网关必须独立拒绝修改版客户端的超限请求，或把它们计入额度。
- 第一版停用账号通知，因为青狮尚未提供可选的通知端点。
- 第一版也会停用 DeepSeek 网页搜索与 DeepSeek 网页抓取；匿名 HTTP 页面抓取仍然启用，网关搜索要等共享的短模型 JWT 凭据 seam 与 `/v1/tools` 路由完成后再开放。
- 青狮龙虾 1.0 本地数据迁移和已有免费、付费技能目录明确不在青狮龙虾 2.0 第一阶段范围内。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

青狮龙虾专属插件行应集中在本层。不要复制完整上游 Web patch，否则上游日常新增 roster 项都会转化为合并工作。

</details>
