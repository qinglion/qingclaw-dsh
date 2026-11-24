---
description: "青狮账号菜单的“意见反馈”行与创始人微信二维码弹窗。"
kind: "package-reference"
---

# 青狮反馈

[English](README.md) | 中文

## 概述

青狮龙虾用应用内弹窗替换账号菜单内置的问卷行，弹窗显示创始人的微信二维码。插件以优先级 -10 占用 `settings.launcher.feedback` 单元，因此取代优先级为 0 的内置条目显示；账号插件仍为其它发行版本保留自己的条目。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用此包

单元与启动器焦点由账号包负责。选中该行会关闭账号菜单，并由 shell 覆盖层显示弹窗，因此关闭菜单不会卸载它；通过关闭按钮、Escape 或遮罩关闭弹窗后，焦点回到账号入口。二维码以 500 × 500 px 的 WebP 资源随包提供，弹窗不读取网络资源。

行标签、弹窗标题、提示、关闭标签和图片替代文本都来自 `qingclaw.feedback` 字典；日语、西班牙语、法语、德语、俄语和葡萄牙语回退到英文。本包的宿主端为空 `apply`，Loader 凭它加载该行，实际只提供浏览器端展示。

<a id="model-experience"></a>
## 模型体验

无，反馈行只渲染本地文案和一个包内资源。

#### KV Cache effect

不改变模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 二维码是静态包资源：更换联系方式需要替换 `src/client/assets/feedback-qrcode.webp`，所有用户看到同一张码。
- 中文、英文之外的六种字典回退到英文。
