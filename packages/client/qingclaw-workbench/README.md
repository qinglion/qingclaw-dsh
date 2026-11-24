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

Include the Host plugin and its Client contribution in the product bundle. The Host reads `/workbenches/index.json` from `QINGCLAW_PLATFORM_ORIGIN`, which defaults to `https://qingclaw.com`. Each catalog entry identifies an exact `@qinglion` package version at `https://npm.qingclaw.com/` and its `panelId`. That private registry answers only a signed-in QingClaw account, so the Host exchanges the account's platform grant for a short-lived registry token and uses it to read a workbench's README and to install it through the native plugin manager, which reports the installed state. The token stays in the Host process; without a signed-in account, a README and an installation report that sign-in is required. Installation additionally requires an active professional licence: a free account can browse the catalog and read details, and an installation reports that the professional plan is required. Once the plugin registers that `main` panel, users can open it directly. Installed panels appear in the sidebar automatically. The native sidebar provides the pin controls. With caching enabled, a previously verified directory from the same website can restore installed panels when the client is offline. Installing a new package requires the online directory.

The plugin registers a `main` panel and a `sidebar.panellist` entry with the same ID so you can open it before publication. Set `qingclaw.workbench.panelId` in `package.json` to that ID. The official catalog also supplies the sidebar entry for listed plugins that only register a main panel.

Build the plugin, then open **Plugins → Add plugin**, enter the absolute path to the local package directory and install it. Try the panel from the sidebar. Use the QingClaw publication skill to publish the package to the private npm registry. In Creator center, choose the published version under My plugins to request listing. Once approved, the release appears in the workbench catalog. [Example workbench package](https://github.com/qinglion/dsh-media-desk)

Existing integrations can still call `getFeed(refresh)` for Feed v1 at `https://qingclaw.com/api/workbench-feed`. This API retains its validated last good feed if a refresh fails. Set `cacheFile` to an absolute owner-private path to retain it across restarts. `feedUrl` overrides the legacy feed URL. The catalog and feed share the `cacheTtlMs`, `fetchTimeoutMs`, and `maxResponseBytes` settings. `registry` names the private registry every catalog entry must match and defaults to `https://npm.qingclaw.com/`; point it at another deployment's registry only when that deployment also issues the read grants.

<a id="model-experience"></a>
## Model Experience

None, as browsing and installing workbenches only updates the catalog and local plugin state.

#### KV Cache effect

None. Catalog and feed reads add no tokens to model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Reading a workbench README requires a signed-in QingClaw account, and installing one additionally requires an active professional licence, because the private registry answers no anonymous reads and the product gates installation by plan.
- Favorites are saved in this client’s local browser storage.
- A workbench displays “Restart to open” while its package is installed and its main panel is unavailable.

<a id="dev-note"></a>
### Dev Note

Use `getWorkbenchCatalog(refresh)` for the directory. Keep the legacy `getFeed(refresh)` response compatible for integrations that display learning content. `installWorkbench(name, version)` performs the installation on the Host, so the registry token never reaches the browser; `getWorkbenchReadme(name, version, language)` reads the archive with the same token. The product's other Host plugins read the private registry through `registryAuthorization(registry)`, which returns the account's token without adding it to the Remote surface.
