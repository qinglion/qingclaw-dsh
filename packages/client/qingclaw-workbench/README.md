---
description: "Add the QingClaw learning workbench, public Feed v1 cache, and official links to a DSH product bundle."
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

English | [中文](README.zh.md)

## Summary

This package adds a QingClaw Workbench entry to the DSH sidebar. Its Host half validates and caches the public QingClaw Feed v1 response; its Client half renders a daily quote, latest public videos, featured courses, and links to the official website through DSH slots.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add the package as a Host plugin and include its Client row in the product bundle. The Client mounts this package's generated Remote contribution itself, so the central DSH Remote assembly does not need a QingClaw-specific import.

The default public feed is `https://qingclaw.com/api/workbench-feed`. For durable last-good behavior, configure an absolute owner-private path:

```yaml
- name: '@qinglion/dsh-qingclaw-workbench'
  config:
    cacheFile: !!js dshPath('cache', 'qingclaw-workbench', 'feed.json')
```

`feedUrl`, `cacheTtlMs`, `fetchTimeoutMs`, and `maxResponseBytes` are also configurable. The Host accepts only HTTP(S) feed and card URLs, bounds the response before JSON parsing, limits Feed v1 to 30 videos and four courses, and writes cache replacements atomically with owner-only file permissions. A failed refresh shows a validated last-good result as stale. Without one, the page presents an inline Retry action.

The page registers through the root-scoped `main` and `sidebar.panellist` slots. It does not access `window.Clacky`, old OpenClacky user data, the skill store, or legacy agent mappings.

<a id="model-experience"></a>
## Model Experience

None, as the Workbench only fetches public content for browser presentation and does not modify model context.

#### KV Cache effect

None. The package contributes only a Host content Remote and browser UI.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Feed v1 exposes public learning content only; authentication-gated courses are not surfaced here.
- The daily quote is selected deterministically from the local date and changes after the page remounts on a new day; no midnight timer is retained.
- User avatar, favorites, legacy extension state, skill-market features, and old agent mappings are intentionally excluded from this first version.
- Non-Chinese locales currently use the English copy while product translations are prepared.

<a id="dev-note"></a>
### Dev Note

Keep product composition in the QingClaw bundle. This package owns only its Host/Client protocol, cache, and slots.
