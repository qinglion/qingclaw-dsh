---
description: "青狮输入框上方的额度横幅，以及侧栏底部的额度圆环控件。"
kind: "package-reference"
---

# 青狮账号额度

[English](README.md) | 中文

## 概述

青狮龙虾在两处展示账号剩余额度：余额为空或即将用完时，输入框上方出现提醒横幅；侧栏底部有一个圆环控件，点开可看额度构成。插件占用上游已经声明的 `conversation.input.dock` 与 `sidebar.footer.action` 两个单元，因此不需要改动账号包。

## 目录

- [使用方式](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用方式

插件从账号服务读取已登录账号：`accountUi` 提供登录态与 Platform 链接，`deepseek-account` 远程服务提供携带 `quotaRemaining`、`quotaTotal`、`trialTokens`、`topupTokens` 的资料。每次收到 `account-ui/change` 帧以及每次打开圆环菜单都会重新读取；读取失败时保留上一次结果。

余额为空、或降到上次充值以来授予额度的 5% 时显示横幅，按钮打开 Platform 充值页；圆环显示剩余占比，菜单里列出额度来源、总额度、可用额度与用量页入口。文案来自 `qingclaw.account` 字典；日语、西班牙语、法语、德语、俄语、葡萄牙语回落到英文。

<a id="model-experience"></a>
## 模型体验

无，两处界面只读取账号事实并渲染本地文案。

#### KV Cache 影响

不改变任何模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 额度数字来自资料读取，网关上报小数时这里取整显示，网关侧仍保留精确值。
- 输入框横幅不知道原生 Platform 页面是否盖住了输入框；账号包内的旧实现用页面声明做过这个判断。

<a id="dev-note"></a>
### 开发备注

横幅渲染工作台 Remote 的 `qingclawWorkbench.getEntitlement()` 返回的额度事实，不持有自己的格式。改动这些事实要同时改 Remote 响应和这里，因为横幅从不直接读资料。
