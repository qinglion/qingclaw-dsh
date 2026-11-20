---
description: "Browse, install, and open QingClaw workbenches from the DSH sidebar."
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

English | [中文](README.zh.md)

## Summary

The Workbenches sidebar entry shows the official QingClaw catalog. In Market, My favorites, or Installed, search by workbench name, package name, author, or category. Install a workbench to open its main panel and pin it to the sidebar.

Select a card to read its summary and the README for the listed version, when available. Returning to the catalog preserves your tab, search, and category filter.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Include the Host plugin and its Client contribution in the product bundle. The Host reads `/workbenches/index.json` from `QINGCLAW_PLATFORM_ORIGIN`, which defaults to `https://qingclaw.com`. Each catalog entry identifies an exact `@qinglion` package version at `https://npm.qingclaw.com/` and its `panelId`. The native plugin manager installs the package and reports its installed state. Once the plugin registers that `main` panel, users can open it directly. Installed panels appear in the sidebar automatically. The native sidebar provides the pin controls. With caching enabled, a previously verified directory from the same website can restore installed panels when the client is offline. Installing a new package requires the online directory.

Start a new workbench from the **Creator center** sidebar entry and select a project directory. The plugin registers a `main` panel and a `sidebar.panellist` entry with the same ID so you can open it before publication. Set `qingclaw.workbench.panelId` in `package.json` to that ID. The official catalog also supplies the sidebar entry for listed plugins that only register a main panel.

Build the plugin, then open **Plugins → Add plugin**, enter the absolute path to the local package directory and install it. Try the panel from the sidebar. Use the QingClaw publication skill to publish the package to the private npm registry. In Creator center, choose the published version under My plugins to request listing. Once approved, the release appears in the workbench catalog. [Example workbench package](https://github.com/qinglion/dsh-media-desk)

Existing integrations can still call `getFeed(refresh)` for Feed v1 at `https://qingclaw.com/api/workbench-feed`. This API retains its validated last good feed if a refresh fails. Set `cacheFile` to an absolute owner-private path to retain it across restarts. `feedUrl` overrides the legacy feed URL. The catalog and feed share the `cacheTtlMs`, `fetchTimeoutMs`, and `maxResponseBytes` settings.

<a id="model-experience"></a>
## Model Experience

None, as browsing and installing workbenches only updates the catalog and local plugin state.

#### KV Cache effect

None. Catalog and feed reads add no tokens to model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Favorites are saved in this client’s local browser storage.
- A workbench displays “Restart to open” while its package is installed and its main panel is unavailable.

<a id="dev-note"></a>
### Dev Note

Use `getWorkbenchCatalog(refresh)` for the directory. Keep the legacy `getFeed(refresh)` response compatible for integrations that display learning content.
