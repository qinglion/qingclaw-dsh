---
description: "在应用内打开青狮官网页面，而不是跳到浏览器标签。"
kind: "package-reference"
---

# 青狮官网页面

[English](README.md) | 中文

## 概述

青狮的插件需要把用户送到官网的充值页和用量页。这个插件统一负责这次跳转：宿主带原生 Platform 视图时，页面在应用内打开；其他宿主退化为浏览器标签，因为官网只在那里能渲染。

## 目录

- [使用方式](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用方式

注入 `qingclawPlatform`，调用 `open(page, onReturned?)`，`page` 取 `'top-up'` 或 `'usage'`。服务通过 `accountUi.openPlatformPage` 交给账号插件自己的 Platform 宿主，因此应用始终只有一个原生视图，并沿用账号页面的归属规则：更新的请求会顶掉先前请求，且只有用户自己返回时才触发 `onReturned`。没有该宿主时，服务把账号公布的链接开在浏览器标签里，并在窗口下一次获得焦点时报告返回。

两个调用方都会传一个重读账号的回调，用户一回来额度数字就刷新。

<a id="model-experience"></a>
## 模型体验

无，插件只打开页面，不持有任何模型输入。

#### KV Cache 影响

不改变任何模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 浏览器宿主无法在应用内展示：官网不允许被 iframe 嵌入，那里只能开标签页。
- 目的地只有账号公布的两个链接；发行版没有公布链接时不打开任何页面。
