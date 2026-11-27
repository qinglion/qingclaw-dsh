---
description: "账号不持有专业版授权时暂停已安装的青狮工作台，续费后恢复。"
kind: "package-reference"
---

# 青狮工作台授权

[English](README.md) | 中文

## 概述

当登录账号不再持有专业版授权时，暂停已安装的 QingClaw 工作台，记住当时已启用的集合，在续费后恢复同一集合，并在失效用户尝试启用时给出升级提示。它只改变插件选择，不增加任何面向模型的输入。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

由 QingClaw 分发组合包挂载；profile 通过 `cordis.patch.yml` 行配置：

```yaml
- id: qingclaw-entitlement
  name: '@qinglion/dsh-qingclaw-entitlement'
  config:
    lockedFile: !!js dshPath('state', 'qingclaw-entitlement', 'locked.json')
    licenceFile: !!js dshPath('state', 'qingclaw-entitlement', 'licence.json')
```

| 字段 | 含义 |
|---|---|
| `pollMs` | 授权重读间隔；`0` 关闭定时器。默认十分钟。 |
| `lockedFile` | 绝对路径 JSON，记录降级时被禁用的工作台。 |
| `licenceFile` | 绝对路径 JSON，缓存最近一次观察到的授权，账号服务不可用时使用。 |
| `fallbackPrefix` | 目录不可用时视为工作台的包名前缀，默认 `@qinglion/`。 |

插件从 `ctx.deepseekAccount` 读取授权：`getPlatformSession()` 判断是否已登录，`getProfile()` 提供套餐、授权期和钱包状态。工作台服务只提供目录包名。专业版的口径是 `plan === 'pro'`、授权期未结束、钱包订阅仍有效，与平台规则一致。

<a id="understand-the-implementation"></a>
## 实现说明

1. 启动时和每次轮询，比较实时授权与持久记录。
2. 授权失效时，列出当前已启用的 profile 工作台，把包名写入 `lockedFile`，再逐个调用 `ctx.pluginManager.setBundleEnabled(name, false)`。选择会持久化，重启后仍保持禁用。
3. 授权恢复时，只重新启用记录中的包名，并删除记录。用户原本就禁用的工作台不会被记录或恢复；已卸载的包名会被丢弃。
4. 授权失效期间用户手动启用的工作台会被再次禁用，但不会加入记录：续费恢复的是失效瞬间的集合，不是之后的手动变更。
5. 这次启用开始时，Host 发出 `qingclaw-entitlement/upgrade-required`；客户端半弹窗显示目录标题，提供“去升级”（打开内嵌充值页）和“稍后”。未登录账号不会收到这个升级提示：没有授权凭据时无法确认专业版。
6. 弹窗打开期间以及关闭后的五分钟内，客户端每五秒检查一次授权，确认生效后重新发起启用；Host 也会在五分钟内每五秒重读一次作为兜底。支付完成后无需等常规轮询或重启，记录中的工作台会自动恢复。

禁用 bundle 会停止它的 Loader 行。工具、提示词段、Remote、定时器都是 fiber effect，随行停止；恢复 bundle 时重新启动。插件不修改任何工作台包。

<a id="dev-note"></a>
## 开发备注

`tests/entitlement.spec.ts` 用假的 manager 与 account 驱动插件：专业版启动、失效、续费、失效期间手动启用，以及缓存授权的两条路径。

<a id="model-experience"></a>
## 模型体验

### 工作台工具与提示词

#### 模型看到什么

本插件不产生任何模型输入。工作台被禁用期间，它的 `ctx.tools` 注册和提示词贡献从下一步消失，模型看到更小的工具集和提示词。

#### Token 影响

不增加输入或输出 token。移除工作台的工具和提示词段会减少请求内容。

#### KV Cache 影响

插件本身无影响。增加或移除工作台会改变工具定义和提示词，从第一个变化的段开始使前缀失效。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 记录是失效瞬间的快照。失效期间手动安装的工作台会被禁用，但不会在续费后自动恢复。
- Host 没有 HMR 时，`setBundleEnabled` 只保存选择并返回 `restart-required`；工作台会继续运行到下次启动。
- 提示覆盖的是工作台 bundle 级开关。通过 `setPluginEnabled` 单独切换某个 Loader 行不会被识别为启用工作台。
- 没有 `pluginManager` 时（例如 headless profile）插件不做任何事。
