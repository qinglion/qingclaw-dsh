---
description: "QingClaw plugin market review, listing approval, and account role management."
kind: "package-reference"
---

# QingClaw management

English | [中文](README.zh.md)

## Summary

Administrators open Plugin management from the QingClaw management account menu. All packages published to the QingClaw registry are visible, including versions without a listing request. Administrators can confirm a maintainer for legacy packages, review requested versions, delist a version and manage user roles.

Creators use their separate Creator center to request a listing for a version they maintain. Delisting a version removes it from the market and preserves the npm artifact.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as account menu navigation does not construct model input.

#### KV Cache effect

None. Marketplace activity uses the account API.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Listings accept exact versions of packages in the QingClaw registry’s `@qinglion/` scope.

<a id="dev-note"></a>
### Dev Note

Client and Host suites cover the management tables, listing actions, role changes and the desktop transport against recorded account responses.
