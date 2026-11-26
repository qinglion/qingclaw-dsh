---
description: "QingClaw website pages opened inside the application instead of a browser tab."
kind: "package-reference"
---

# QingClaw platform pages

English | [中文](README.zh.md)

## Summary

QingClaw plugins send the viewer to the deployment's website for top-up and usage. This plugin owns that navigation once: on a host with the native Platform view the page opens inside the application; elsewhere it opens a browser tab, which is the only place the website can render.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Inject `qingclawPlatform` and call `open(page, onReturned?)` with `'top-up'` or `'usage'`. The service delegates to the account plugin's own Platform host through `accountUi.openPlatformPage`, so the application keeps a single native view and the account's page ownership rules apply: a newer request retires the earlier one, and `onReturned` runs only when the viewer came back on their own. Without that host the service opens the account's published link in a browser tab and reports the return on the next window focus.

Both callers pass a return callback that re-reads the account, so the credit figures refresh as soon as the viewer is back.

<a id="model-experience"></a>
## Model Experience

None, as the plugin only opens a page and holds no model input.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- A browser host cannot show the page in-application: the QingClaw website does not allow framing, so the tab is the only route there.
- The destinations are the account's two published links; a deployment that publishes no link opens nothing.
