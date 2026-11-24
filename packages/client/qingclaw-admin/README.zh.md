---
description: "青狮插件市场的审核、上架处理与账号角色管理。"
kind: "package-reference"
---

# 青狮管理

[English](README.md) | 中文

## 概述

管理员从账号菜单进入「青狮管理 → 插件管理」，默认查看青狮私服的全部包和版本，包括未申请的版本。管理员可指定存量包的维护者、审核申请、下架版本和管理用户角色。

创作者在独立的「创作者中心」为自己维护的版本申请上架。下架只更新市场目录，私服保留该版本。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

无，因为账号导航不会构造模型输入。

#### KV 缓存影响

无。市场操作通过账号 API 完成。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 上架申请支持青狮私服中 `@qinglion/` 范围内、具有确切版本号的包。

<a id="dev-note"></a>
### 开发备注

客户端与 Host 测试覆盖管理表格、上架操作、角色变更，以及桌面传输对账号响应的处理。
