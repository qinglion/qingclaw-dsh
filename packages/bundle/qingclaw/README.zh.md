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

生产环境默认用 `https://qingclaw.com` 完成账号授权，用 `https://api.qingclaw.com` 完成模型推理。开发与 beta 验证可设置 `QINGCLAW_PLATFORM_ORIGIN` 和 `QINGCLAW_INFERENCE_ORIGIN`；正式发布环境保持未设置，避免本地地址意外进入发行端点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

patch 定位已有的账号、模型、通知与官方品牌行 id，只替换这些行的完整配置或启用状态，再插入青狮自有插件行。账号服务继续复用 DSH 的浏览器授权、本机 PKCE 回调、凭据存储和账号模型选择，青狮 Rails 平台负责实现兼容的服务端协议。模型 provider 会把设备会话换成短期模型 JWT，并且只把这个 JWT 发往青狮网关；上游模型密钥不会到达桌面端。当前旧版 Serverless 网关使用自带的消费者 JWT 与本地非对称 JWKS 鉴权，不走该版本不支持的插件市场 `jwt-auth`/`remote_jwks` 方案。本 bundle 不复制 Web roster。后续青狮业务能力可以作为额外插件行加入本 bundle，无需修改 DSH agent loop。

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

本层增加零提示词 Token。推理用量由所选模型与请求决定，与发行 patch 无关。

#### KV Cache 影响

本层不改变请求前缀，因此不影响 KV Cache。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 本 bundle 必须位于 Web 应用层之后，因为它定位后者声明的配置行。
- 青狮账号与网关服务必须保持 DSH 账号协议、`x-dsh-auth-token` 契约、模型目录结构和 Messages 流式行为兼容。网关消费者 JWT 契约使用 `Bearer ` 前缀与 `aud=qingclaw-model-gateway`。
- 第一版停用账号通知，因为青狮尚未提供可选的通知端点。
- 青狮龙虾 1.0 本地数据迁移和已有免费、付费技能目录明确不在青狮龙虾 2.0 第一阶段范围内。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

青狮龙虾专属插件行应集中在本层。不要复制完整上游 Web patch，否则上游日常新增 roster 项都会转化为合并工作。

</details>
