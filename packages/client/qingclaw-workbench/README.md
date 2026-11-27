---
description: "Browse, install, and open QingClaw workbenches from the DSH sidebar."
kind: "package-reference"
---

# @qinglion/dsh-qingclaw-workbench

English | [中文](README.zh.md)

## Summary

The Workbenches sidebar entry shows the official QingClaw catalog. In Market, My favorites, or Installed, search by workbench name, package name, author, or category. Install a workbench to open its main panel and pin it to the sidebar.

Select a card to open a product page with the workbench summary and its screenshots in a horizontal, snap-scrolling strip; selecting a screenshot shows it full size. Returning to the catalog preserves your tab, search, and category filter.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Include the Host plugin and its Client contribution in the product bundle. The Host reads `/workbenches/index.json` from `QINGCLAW_PLATFORM_ORIGIN`, which defaults to `https://qingclaw.com`. Each catalog entry identifies an exact `@qinglion` package version at `https://npm.qingclaw.com/` and its `panelId`. That private registry answers only an account with an active professional licence (plan `pro`, unexpired, and still backed by its wallet subscription): the platform withholds the read grant from a free account, so the Host never obtains the short-lived registry token that reads a workbench's README or installs it through the native plugin manager. A free account still browses the catalog and sees its public preview images. A signed-in account without the licence sees Upgrade to Pro where Install would be; that action opens the Platform page that sells the plan, the same page the account's top-up opens, and the return re-reads the licence so the same card offers its installation or update once the licence is active. A refused README read or installation still reports that the professional plan is required. The token stays in the Host process. Once the plugin registers that `main` panel, users can open it directly. Installed panels appear in the sidebar automatically. The native sidebar provides the pin controls. With caching enabled, a previously verified directory from the same website can restore installed panels when the client is offline. Installing a new package requires the online directory.

When the catalog publishes a newer version than the installed copy, the entry offers Update to that version and reinstalls it through the same registry grant. A workbench's detail page uninstalls it behind the same confirmation the plugin page asks, and the list treats a removal as applied immediately instead of waiting for the running inventory to catch up. The product page states its actions rather than a status, carries the same enable switch as the plugin page, and a card offering an update drops the installed label it would otherwise repeat. A disabled workbench stays installed: its card shows a Disabled tag and cannot open it. A failed installation, update, uninstall, toggle, or favorite reports through the floating toast the shell overlay hosts, so the grid keeps its layout and a panel switch cannot drop the message; only a failed directory read keeps its retry notice on the page.

Installations and updates run on the Host, and their status lives in the client store, so switching pages or reloading the client neither cancels them nor loses their progress. While one runs, the card and the product page show two bars, Download and Install, parsed from the manager's install log: an indeterminate Download bar before pnpm reports counts, percentages while packages fetch and link, and an Enabling phase while the bundle activates. A client that mounts mid-installation adopts it through `getActiveInstalls()` and awaits the manager's `waitForInstall(requestId)` rather than offering a second install; the `requestId` supplied by the installing client correlates the manager's `install-state` and `install-log` events.

The plugin registers a `main` panel and a `sidebar.panellist` entry with the same ID so you can open it before publication. Set `qingclaw.workbench.panelId` in `package.json` to that ID. The official catalog also supplies the sidebar entry for listed plugins that only register a main panel.

Every listed release declares its catalog metadata in `qingclaw`: localized `name` and `description` tables, with Chinese `zh` required today, plus `workbench.icon` and at least two `workbench.previews` image paths for a workbench. Images ship inside the package tarball, for example `./assets/workbench/icon.svg`, so a creator never needs write access to the website; an icon or preview may be any image type the catalog serves, including SVG, PNG, WebP, and JPEG; approving the release copies those images into the website's configured object storage, and the catalog serves them from there. A listing request that omits a declared field or file is refused with the missing item named, and the catalog publishes that release's `iconUrl` and `previews` so the sidebar launcher and the detail page show them.

A release may also declare up to eight `qingclaw.links` to related resources, such as a video-account post. A link is either a bare URL, whose title and cover publishing reads from the page, or an object `{ "url", "title", "image" }` that supplies them from the package for pages that serve no readable preview. The product page shows a card per link that opens the original page.

Build the plugin, then open **Plugins → Add plugin**, enter the absolute path to the local package directory and install it. Try the panel from the sidebar. Use the QingClaw publication skill to publish the package to the private npm registry. In Creator center, choose the published version under My plugins to request listing. Once approved, the release appears in the workbench catalog. [Example workbench package](https://github.com/qinglion/dsh-media-desk)

Existing integrations can still call `getFeed(refresh)` for Feed v1 at `https://qingclaw.com/api/workbench-feed`. This API retains its validated last good feed if a refresh fails. Set `cacheFile` to an absolute owner-private path to retain it across restarts. `feedUrl` overrides the legacy feed URL. The catalog and feed share the `cacheTtlMs`, `fetchTimeoutMs`, and `maxResponseBytes` settings. `registry` names the private registry every catalog entry must match and defaults to `https://npm.qingclaw.com/`; point it at another deployment's registry only when that deployment also issues the read grants.

<a id="model-experience"></a>
## Model Experience

None, as browsing and installing workbenches only updates the catalog and local plugin state.

#### KV Cache effect

None. Catalog and feed reads add no tokens to model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Reading a workbench README and installing one require an active professional licence: the plan must be `pro`, its period must not have ended, and the account's wallet must still carry the subscription that granted it, so a licence edited on its own never grants access. The platform withholds the private registry's read credential from a free account, so the market offers the upgrade and opens the plan page instead of retrying.
- Favorites are saved in this client’s local browser storage.
- A workbench displays “Restart to open” while its package is installed and its main panel is unavailable.

<a id="dev-note"></a>
### Dev Note

Use `getWorkbenchCatalog(refresh)` for the directory. Keep the legacy `getFeed(refresh)` response compatible for integrations that display learning content. `installWorkbench(name, version, requestId)` and `updateWorkbench(name, version, requestId)` perform the installation on the Host, so the registry token never reaches the browser; the caller's `requestId` names the manager's progress events and its recovery, and `getActiveInstalls()` lists the installations the Host still runs so a reloaded client can adopt them. `getWorkbenchReadme(name, version, language)` reads the archive with the same token. The product's other Host plugins read the private registry through `registryAuthorization(registry)`, which returns the account's token without adding it to the Remote surface.
