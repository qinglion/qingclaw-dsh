---
description: "使用短期模型网关凭据的青狮龙虾账号鉴权。"
kind: "package-reference"
---

# @qinglion/dsh-llm-qingclaw-account

[English](README.md) | 中文

## 概述

为青狮龙虾注册 `deepseek-account` 模型路由。插件继续使用 `deepseekAccount` 保存的青狮龙虾平台设备会话，将它换成有效期 15 分钟的模型 JWT，并且只把这个短期 JWT 发往青狮模型网关。

Messages 传输与目录规则来自 [`@deepseek-ai/dsh-llm-deepseek`](../llm-deepseek/README.zh.md)。Messages 默认端点为 `https://api.qingclaw.com/anthropic`，模型发现使用 `https://api.qingclaw.com/models`。

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
        baseURL: https://api.qingclaw.com/anthropic
```

插件向当前登录平台 origin 下的 `/auth-api/v0/dsh/model_token` 发起 POST 请求。同一设备会话的并发换取只产生一次请求。JWT 只保存在内存中，并在 `exp` 前 60 秒停止使用。

首次鉴权目录访问会请求网关 origin 下的 `/models`。路由缺失或请求失败不会阻断 Messages：还没有成功列表时，青狮龙虾插件会公布已经通过网关实测的纯文本模型目录（Qwen Plus、Qwen 3.8 Flash、Qwen 3.8 Max、DeepSeek V4.1 Flash、Kimi K3.1 Pro）；成功获取过列表后，刷新失败会保留最后一份可用目录。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/anthropic` | Messages 端点，其 origin 同时提供 `/models` |
| `modelTokenTimeoutMs` | `30,000` | 单次平台模型 token 换取的超时 |
| `modelsTimeoutMs` | `5,000` | 单次模型列表请求的超时 |
| `modelsMaxAgeMs` | `600,000` | 模型列表刷新间隔；`0` 表示只在访问时刷新 |
| `modelOverrides` | `{}` | 覆盖远端或内置目录中单个模型的元数据 |

<a id="security-and-failure-boundaries"></a>
## 安全与失败边界

长期设备 token 只会以 `X-DSH-Auth-Token: <device token>` 发往当前登录的平台 origin。Messages 与 `/models` 只接收 `X-DSH-Auth-Token: Bearer <short JWT>`，与托管网关要求的值前缀一致。`deepseekAccount.getPlatformSession()` 返回的部署请求头会保留在平台换取请求中，不会复制到模型网关。

当前部署使用阿里云 AI 网关旧版 Serverless 实例自带的消费者 JWT 鉴权。`qingclaw-desktop` 消费者保存从平台签发方复制的本地非对称 JWKS，从 `X-DSH-Auth-Token` 读取带 `Bearer ` 前缀的 token，并以 `aud=qingclaw-model-gateway` 识别消费者。网关转发前会移除 JWT，只把 `quota_key`、`tier` 与 `sub` 映射到青狮自有上游请求头。旧版 Serverless 不支持插件市场，因此本部署不能配置或描述为独立的 `jwt-auth` 插件或 `remote_jwks`。轮换密钥时，应先在消费者 JWKS 中同时保留新旧公钥，再让平台开始用新密钥签发。

模型网关返回 HTTP 401 时，只清除被拒绝的那个短期 JWT；下一次请求会重新换取，不会让用户退出登录。只有 `/auth-api/v0/dsh/model_token` 返回 HTTP 401 时才会拒绝匹配的长期设备会话。该端点返回 HTTP 403 表示账号权益不足，但不会清除登录状态。

<a id="dev-note"></a>
## 开发备注

针对性测试覆盖单飞换取、过期、响应校验、平台与网关的 401 边界、Loader namespace 组合、`/models` 404 时回退青狮龙虾插件内置的已验证多模型目录，以及使用短期 JWT 成功执行 Messages 流式请求。

<a id="model-experience"></a>
## 模型体验

### 已鉴权的模型请求

#### What the model sees

`deepseek-account` 请求不增加模型可见文本；请求由共享 Messages 传输序列化。

#### Token effect

鉴权和目录获取不增加输入 token。解析后的目录仍决定上下文窗口和默认输出上限。

#### KV Cache effect

设备会话和模型 JWT 都不会进入模型输入，因此凭据换取或刷新不会改变提示词前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- token 与列表缓存只在当前进程中保存，重启后会重建。
- 模型网关必须校验模型 JWT 的 audience 与 claims；桌面客户端使用前只校验有效期元数据。
- 没有 `/models` 时，模型目录由青狮龙虾插件的已验证清单提供；新增模型仍应先完成网关实测，再更新插件或开启动态目录路由。
