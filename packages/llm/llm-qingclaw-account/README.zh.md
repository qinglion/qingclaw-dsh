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
- [媒体工具](#media-tools)
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

桌面发行配置将 `catalogURL` 指向官网的 `/auth-api/v0/dsh/models`。目录刷新失败时沿用缓存，首次成功获取目录前不公布任何模型。每个模型以目录中的 id 命名，提供方不保留自己的显示名。目录中的 `rate` 是模型未命中缓存的输入价与当前部署默认模型标准输入价之比，官网在每次同步和切换默认模型时重算；提供方只把它作为展示元数据下发。目录中的 `max_output_tokens` 和 `context_window` 来自网关模型卡片，决定单次请求的输出上限和整个上下文窗口：声明值高于路由默认值时仍按路由默认值执行，卡片没给出正整数时沿用路由预算。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/v1` | OpenAI 兼容 API 的基础地址 |
| `modelTokenTimeoutMs` | `30,000` | 单次平台模型 token 换取的超时 |
| `modelsTimeoutMs` | `5,000` | 单次模型列表请求的超时 |
| `modelsMaxAgeMs` | `600,000` | 模型列表刷新间隔；`0` 表示只在访问时刷新 |
| `modelOverrides` | `{}` | 在官网目录条目之上覆盖单个模型的元数据 |

<a id="media-tools"></a>
## 媒体工具

组合提供了工具注册表时，插件注册 `image_generate`、`video_generate` 和 `video_get`。它们使用与 Chat Completions 相同的网关密钥鉴权，并原样返回网关的 JSON 应答。

每次生成前先向官网申请计费票据（`/auth-api/v0/dsh/media/authorize`）。官网扣减账户额度并同步降低网关配额，再返回两分钟有效的票据。额度不足时官网返回 402，插件直接展示「额度不足，请升级或充值」，不会调用网关。网关媒体路由要求 `X-QingClaw-Media-Ticket`；调用成功后结算，失败时退款。

`video_generate` 在 `/video/api/v1/services/aigc/video-generation/video-synthesis` 上创建一个异步任务。模型按素材槽位自动路由，因此同一条路由即可覆盖文生视频、首帧生视频、参考生视频、视频编辑和视频延长：

| 字段 | 含义 |
|---|---|
| `prompt` | 必填，描述主体、动作、运镜和风格；按发送顺序用「图1」「视频1」「音频1」指代素材 |
| `seconds` | 2 到 30 之间的整数秒，或用 `auto` 交给模型决定时长，默认 5 |
| `size` | 输出像素，例如 `1280x720`；480、720、1080 决定分辨率档位，默认 480P |
| `ratio` | `adaptive`、`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`；不填则跟随素材 |
| `sound` | 成片是否带音轨；网关默认带声音 |
| `firstFrame` / `lastFrame` | 成片的首帧和尾帧图片 |
| `images` | 最多 10 张参考图 |
| `videos` | 最多 5 段参考视频（mp4/mov，总时长不超过 15 秒） |
| `audios` | 最多 5 段参考音频（mp3/wav，总时长不超过 15 秒） |

首尾帧与参考素材互斥：一次调用只发送 `firstFrame`/`lastFrame`，或只发送 `images`/`videos`/`audios`，因为网关拒绝混用任务类型。

本地图片路径通过会话文件系统服务读取，并以 `data:` URL 发送，字节不进入对话；图片支持 `jpg`、`jpeg`、`png`、`webp`、`bmp`，单张不超过 20 MB。参考视频和音频由网关拉取，因此必须是 `https` 或 `oss://` URL。

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

`POST /v1/chat/completions` 传输会话、附件和工具定义。鉴权信息只随请求头发送。

#### Token effect

鉴权和目录获取不增加输入 token。解析后的目录仍决定上下文窗口和默认输出上限。

#### KV Cache effect

设备会话和模型 JWT 都不会进入模型输入，因此凭据换取或刷新不会改变提示词前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- token 与列表缓存只在当前进程中保存，重启后会重建。
- 账号权限和额度由推理网关校验。
- 官网目录首次应答前不公布任何模型，因此登录后无法访问官网的客户端无法开始对话。
- `video_generate` 未开放 `file` 和 `link` 素材槽位，因此暂不能用文档和网页作视频参考。