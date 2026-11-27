---
description: "QingClaw credit quota banner beside the composer and quota control in the sidebar footer."
kind: "package-reference"
---

# QingClaw account credits

English | [中文](README.zh.md)

## Summary

QingClaw shows how many credits an account has left in two places: a warning banner above the composer when the balance is empty or nearly gone, and a ring control in the sidebar footer that opens the credit breakdown. The plugin occupies two slots the upstream shell already declares — `conversation.input.dock` and `sidebar.footer.action` — so the account package stays unmodified.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The plugin reads the signed-in account from the account service: `accountUi` publishes the grant state and the Platform links, and the `deepseek-account` remote supplies the profile that carries `quotaRemaining`, `quotaTotal`, `trialTokens`, and `topupTokens`. It re-reads after every `account-ui/change` frame and whenever the ring menu opens; a failed read keeps the previous facts.

The banner appears while the balance is empty or at 5% of the credits granted since the last recharge, and its action opens the Platform top-up page. The ring shows the remaining share and opens a menu with the credit source, the total, the remaining amount, and the usage page. Copy comes from the `qingclaw.account` dictionary; Japanese, Spanish, French, German, Russian, and Portuguese fall back to English.

<a id="model-experience"></a>
## Model Experience

None, as both credit surfaces read account facts and render local copy only.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The credit facts come from the profile read, so a gateway that reports fractional credits is rounded for display here while the gateway keeps exact amounts.
- The composer banner does not know when a native Platform page covers the composer; the account package's own banner tracked that claim internally.

<a id="dev-note"></a>
### Dev Note

The banner renders the credit facts `qingclawWorkbench.getEntitlement()` returns and owns no format of its own. A change to those facts changes the Remote response and this banner together, because the banner never reads the profile directly.
