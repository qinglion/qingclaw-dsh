---
description: "Suspends the installed QingClaw workbenches while the account holds no professional licence and restores them after renewal."
kind: "package-reference"
---

# QingClaw workbench entitlement

English | [中文](README.zh.md)

## Summary

Suspends the installed QingClaw workbenches when the signed-in account no longer holds the professional licence, remembers the set that was enabled, turns that same set back on after renewal, and offers the upgrade prompt when a lapsed user tries to enable one. It changes plugin selection and adds no model-facing surface.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The QingClaw distribution bundle mounts it; a profile configures it through its `cordis.patch.yml` row:

```yaml
- id: qingclaw-entitlement
  name: '@qinglion/dsh-qingclaw-entitlement'
  config:
    lockedFile: !!js dshPath('state', 'qingclaw-entitlement', 'locked.json')
    licenceFile: !!js dshPath('state', 'qingclaw-entitlement', 'licence.json')
```

| Field | Meaning |
|---|---|
| `pollMs` | Licence re-read interval; `0` disables the timer. Defaults to ten minutes. |
| `lockedFile` | Absolute JSON file holding the workbenches the lapse disabled. |
| `licenceFile` | Absolute JSON cache of the last observed licence, used when the account cannot answer. |
| `fallbackPrefix` | Package-name prefix treated as a workbench when the catalog cannot answer. Defaults to `@qinglion/`. |

The plugin reads the licence from `ctx.deepseekAccount`: `getPlatformSession()` decides whether anyone is signed in, and `getProfile()` supplies the plan, period, and wallet state. The workbench service supplies only the catalog of listed package names. A professional licence means `plan === 'pro'`, an unexpired period, and an active wallet subscription, the same rule the platform applies.

<a id="understand-the-implementation"></a>
## Understand the implementation

1. On startup and on every poll, the plugin compares the live licence with the durable record.
2. When the licence lapses, it lists profile-installed workbench bundles that are currently enabled, writes their names to `lockedFile`, and calls `ctx.pluginManager.setBundleEnabled(name, false)` for each. The bundle selection is persisted, so a restart keeps them off.
3. When the licence returns, it re-enables exactly the recorded names and deletes the record. Workbenches that were already disabled by the user are never recorded or restored, and names that are no longer installed are dropped.
4. A workbench enabled while the licence is lapsed is disabled again, but it is not added to the record: renewal restores the set captured at the lapse, not later manual changes.
5. When that enable attempt starts, the Host emits `qingclaw-entitlement/upgrade-required`; the Client half shows a modal with the catalog title, an **Upgrade** button that opens the embedded top-up page, and **Not now**. A signed-out account is not prompted this way: without a grant the card cannot verify a licence.
6. While the prompt is open, and for five minutes after it closes, the Client half checks the entitlement every five seconds and retries the enable once it is active; the Host also re-reads the licence every five seconds for five minutes as a backup. A completed payment restores the recorded workbenches without waiting for the normal poll or a restart.

Disabling a bundle stops its Loader rows. Its tools, prompt sections, remotes, and timers are fiber effects, so they leave with the rows; restoring the bundle starts them again. The plugin never edits a workbench package.

<a id="dev-note"></a>
## Dev Note

`tests/entitlement.spec.ts` drives the plugin with a fake manager and account: professional start, lapse, renewal, manual enable during a lapse, and the cached-licence paths.

<a id="model-experience"></a>
## Model Experience

### Workbench tools and prompts

#### What the model sees

Nothing from this plugin. While a workbench is disabled, its `ctx.tools` registrations and prompt contributions are absent from the next step, so the model receives the smaller tool set and prompt.

#### Token effect

No input or output tokens are added. Removing a workbench's tools and prompt sections reduces the request.

#### KV Cache effect

None by itself. Adding or removing a workbench changes the tool definitions and prompt, which invalidates the prefix from the first changed section.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The record is a snapshot of the lapse. A workbench installed manually while the licence is lapsed is disabled but never restored automatically.
- When the Host has no HMR, `setBundleEnabled` saves the change and reports `restart-required`; the workbench keeps running until the next start.
- The prompt covers a workbench bundle toggle. Toggling one individual Loader row through `setPluginEnabled` is not recognized as a workbench enable.
- Without `pluginManager` (for example a headless profile) the plugin does nothing.
