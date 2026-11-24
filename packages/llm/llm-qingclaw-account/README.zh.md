---
description: "使用短期模型网关凭据的青狮龙虾账号鉴权。"
kind: "package-reference"
---

# @qinglion/dsh-llm-qingclaw-account

[English](README.md) | 中文

## 概述

青狮账号模型沿用 `deepseek-account` 提供方标识，已有会话和模型选择继续使用该标识。

桌面客户端通过 OpenAI 兼容的 `POST /v1/chat/completions` 发送文字、图片、工具调用和工具结果。登录后的模型目录由青狮官网提供。

## 目录

- [使用此包](#use-this-package)
- [安全与失败边界](#security-and-failure-boundaries)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用此包

挂载此插件来替代 `@deepseek-ai/dsh-llm-deepseek-account`，同时保留 `deepseek-account` 提供方 id。青狮龙虾 bundle 会停用上游账号提供方，并以 `llm-qingclaw-account` entry id 插入此插件。

```yaml
- id: llm-deepseek-account
  disabled: true
- insert:
    - id: llm-qingclaw-account
      name: '@qinglion/dsh-llm-qingclaw-account'
      config:
        baseURL: https://api.qingclaw.com/v1
```

客户端从登录平台的 `/auth-api/v0/dsh/model_token` 取得模型目录 JWT，从 `/auth-api/v0/dsh/model_key` 取得当前用户的网关密钥。同一会话的并发请求共享各自的凭据换取操作。

桌面发行配置将 `catalogURL` 指向官网的 `/auth-api/v0/dsh/models`。目录刷新失败时使用缓存，首次成功获取目录前使用内置清单。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/v1` | OpenAI 兼容 API 的基础地址 |
| `modelTokenTimeoutMs` | `30,000` | 单次平台模型 token 换取的超时 |
| `modelsTimeoutMs` | `5,000` | 单次模型列表请求的超时 |
| `modelsMaxAgeMs` | `600,000` | 模型列表刷新间隔；`0` 表示只在访问时刷新 |
| `modelOverrides` | `{}` | 覆盖远端或内置目录中单个模型的元数据 |

<a id="security-and-failure-boundaries"></a>
## 安全与失败边界

设备凭据仅发往当前登录的官网。请求模型目录时使用 `X-DSH-Auth-Token: Bearer <目录 JWT>`，请求聊天推理网关时使用 `Authorization: Bearer <用户网关密钥>`。

网关的 Chat Completions 路由需要启用消费者认证并授权桌面消费者组，才能将用量计入登录账号。

网关返回 HTTP 401 时，客户端清理被拒绝的消费者密钥，在下一次请求时重新向官网获取。

<a id="dev-note"></a>
## 开发备注

提供方测试通过已注册的账号模型入口验证平台凭据换取、模型发现和流式聊天请求。

<a id="model-experience"></a>
## 模型体验

### 已鉴权的模型请求

#### What the model sees

Chat Completions 传输会话、附件和工具定义。鉴权信息只随请求头发送。

#### Token effect

鉴权和目录获取不增加输入 token。解析后的目录仍决定上下文窗口和默认输出上限。

#### KV Cache effect

设备会话和模型 JWT 都不会进入模型输入，因此凭据换取或刷新不会改变提示词前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- token 与列表缓存只在当前进程中保存，重启后会重建。
- 账号权限和额度由推理网关校验。
- 官网目录首次加载成功前使用内置模型清单。
