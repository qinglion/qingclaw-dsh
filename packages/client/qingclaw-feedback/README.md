---
description: "QingClaw account-menu feedback row with the founder's WeChat QR dialog."
kind: "package-reference"
---

# QingClaw feedback

English | [中文](README.zh.md)

## Summary

QingClaw replaces the account menu's built-in questionnaire row with an in-app dialog showing the founder's WeChat QR code. The plugin occupies the `settings.launcher.feedback` cell at priority -10, so it renders instead of the built-in entry at priority 0 while the account plugin keeps its own entry for every other distribution.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The account package owns the cell and the launcher focus. Selecting the row dismisses the menu and shows the dialog from the shell overlay, so closing the menu cannot unmount it; closing the dialog by its button, Escape, or the mask returns focus to the account launcher. The QR image ships as a 500 × 500 px WebP package asset, so the dialog reads no network resource.

The row label, dialog title, hint, close label, and image alternative text come from the `qingclaw.feedback` dictionary; Japanese, Spanish, French, German, Russian, and Portuguese fall back to English. The node half is an empty `apply`, so the Loader loads the row while this package contributes browser presentation only.

<a id="model-experience"></a>
## Model Experience

None, as the feedback row renders local copy and a package asset only.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The QR code is a static package asset: changing the contact means replacing `src/client/assets/feedback-qrcode.webp`, and every reader sees the same code.
- The six non-Chinese, non-English dictionaries fall back to English.

<a id="dev-note"></a>
### Dev Note

The QR asset is resolved through the package's `./assets/*` export, so it is imported relatively and emitted under `lib/assets/`; a copy in a documentation folder never reaches the built package.
