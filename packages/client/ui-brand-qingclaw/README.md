---
description: "QingClaw sidebar and blank-session brand occupants for the shared DSH browser shell."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-qingclaw

English | [中文](README.zh.md)

## Summary

This package supplies the layered QingClaw product mark and locale-owned product name to the shared DSH Web shell. The same browser shell is used by Web and Desktop, so one Client plugin brands both surfaces without changing their page components.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Load this package as a browser plugin after the sidebar and conversation packages. The QingClaw distribution bundle performs that composition for shipped QingClaw builds. It replaces the sidebar mark and name and the mark beside the blank-session headline. The two offset Qinglion layers distinguish QingClaw while retaining the product-family geometry and colors.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers one locale dictionary and waits for all three brand slots through nested declaration-aware slot injections. It then installs the mark, name, and hero mark as one set. Removing any declaration withdraws the complete set, and redeclaring it restores the set without leaving mixed branding during reload. The node half remains an inert Loader seat.

-----

<a id="further-exploration"></a>
## Further Exploration

- [QingClaw distribution bundle](../../bundle/qingclaw/README.md) — replaces the shipped official-brand row with this plugin.
- [ui-sidebar](../ui-sidebar/README.md) — owns the sidebar brand slots and surrounding interaction.
- [ui-conversation](../ui-conversation/README.md) — owns the blank-session hero mark slot.

-----

<a id="model-experience"></a>
## Model Experience

### Browser branding

#### What the model sees

Nothing. This package contributes only the `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` browser slots; it adds no prompt text, tools, or session events.

#### Token effect

The plugin adds zero tokens because its slot contributions render only in the browser.

#### KV Cache effect

The plugin does not change request prefixes, so it has no KV-cache impact.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Browser document titles, native application identity, signing, and update endpoints are build-time distribution concerns outside runtime Client slots.
- The first QingClaw 2.0 slice does not migrate QingClaw 1.0 local data or integrate its free and paid skill catalog.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package intentionally follows the existing DSH package namespace while it is built and released inside this fork. Its public user-facing identity is QingClaw.

</details>
