---
description: "为 DSH 产品包接入青狮工作台、官网 Feed v1 缓存与官网链接。"
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

[English](README.md) | 中文

## 概述

本包在 DSH 侧栏中提供青狮工作台。Host 侧负责校验并缓存青狮官网公开 Feed v1；Client 侧通过 DSH slots 展示每日寄语、最新公开视频、精选课程和官网链接。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包加入产品 bundle 的 Host 插件与 Client 组合即可。Client 会自行挂载本包生成的 Remote contribution，因此不需要在 DSH 中央 Remote 清单中增加青狮专用导入。

默认公开 Feed 为 `https://qingclaw.com/api/workbench-feed`。如需持久化 last-good 缓存，请配置绝对且仅当前用户可访问的路径：

```yaml
- name: '@qinglion/dsh-qingclaw-workbench'
  config:
    cacheFile: !!js dshPath('cache', 'qingclaw-workbench', 'feed.json')
```

还可以配置 `feedUrl`、`cacheTtlMs`、`fetchTimeoutMs` 和 `maxResponseBytes`。Host 只接受 HTTP(S) 的 Feed 与卡片链接；在 JSON 解析前限制响应大小；Feed v1 最多保留 30 个视频和四门课程；缓存使用原子替换并设置为仅当前用户可读写。刷新失败时会把通过校验的 last-good 内容标记为过期后继续展示；完全没有缓存时，页面会显示内联重试入口。

页面通过根作用域的 `main` 和 `sidebar.panellist` slots 注册。它不会访问 `window.Clacky`，也不会读取旧 OpenClacky 用户数据、技能商店或历史 agent 映射。

<a id="model-experience"></a>
## 模型体验

无。工作台只获取供浏览器展示的公开内容，不会修改模型上下文。

#### KV Cache 影响

无。本包只提供 Host 内容 Remote 与浏览器 UI。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Feed v1 只展示公开学习内容，暂不承载需要登录授权的课程。
- 每日寄语根据本地日期确定；跨日后在页面重新挂载时更新，不保留午夜定时器。
- 第一版明确不包含用户头像、收藏、旧扩展状态、技能市场功能和历史 agent 映射。
- 除中文外的已发布语言暂时使用英文文案，后续再补产品翻译。

<a id="dev-note"></a>
### 开发备注

产品组合由 QingClaw bundle 负责；本包只拥有 Host/Client 协议、缓存和 slots。
