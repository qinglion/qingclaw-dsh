---
description: "QingClaw distribution patch over the shared DSH Web application bundle."
kind: "package-bundle"
---

# @deepseek-ai/dsh-qingclaw-bundle

English | [中文](README.zh.md)

## Summary

This bundle is the QingClaw-owned distribution layer over the DSH Web application. It keeps upstream Web composition intact, routes account and model traffic to QingClaw-owned services, disables the unavailable Platform-notification surface, and replaces the official browser-brand row with the QingClaw brand plugin. Desktop and browser deployments can select the same layer.

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

Select this bundle after the DSH Web application bundle in a QingClaw profile. QingClaw Desktop embeds it in its profile bundle list, so users do not install or enable it separately. A Web deployment can add the same final layer to receive identical runtime branding and QingClaw account routing.

Production defaults to `https://qingclaw.com` for account authorization and `https://api.qingclaw.com` for inference. Development and beta validation may set `QINGCLAW_PLATFORM_ORIGIN` and `QINGCLAW_INFERENCE_ORIGIN`; release environments leave them unset so a local environment cannot accidentally become a published endpoint.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The patch targets existing account, model, notification, and official-brand row ids. It replaces only their complete configuration or enabled state, then inserts QingClaw-owned plugin rows. The account service retains DSH's browser authorization, local PKCE callback, credential storage, and account-model selection while QingClaw's Rails platform implements the compatible server protocol. The model provider exchanges that device session for a short-lived model JWT and sends only the JWT to the QingClaw gateway; the upstream provider key never reaches Desktop. The deployed legacy Serverless gateway authenticates it with built-in Consumer JWT and a local asymmetric JWKS, not the unsupported plug-in marketplace `jwt-auth`/`remote_jwks` path. The bundle does not copy the Web roster. Later QingClaw business features can join this bundle as additional plugin rows without changing the DSH agent loop.

-----

<a id="further-exploration"></a>
## Further Exploration

- [QingClaw brand package](../../client/ui-brand-qingclaw/README.md) — owns the runtime brand occupants.
- [Web application bundle](../web-app/README.md) — owns the shared Web roster this layer overrides.
- [Profile bundles](../README.md) — explains ordered bundle layers.

-----

<a id="model-experience"></a>
## Model Experience

### QingClaw distribution layer

#### What the model sees

The model sees no extra prompt text. The selected account provider sends its requests through the QingClaw inference origin, keeping authentication in the `X-DSH-Auth-Token` header, and receives the gateway's advertised model catalog.

#### Token effect

The layer adds zero prompt tokens. Inference usage is determined by the selected model and request, not by the distribution patch.

#### KV Cache effect

The layer does not change request prefixes, so it has no KV-cache impact.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This bundle must follow the Web application layer because it targets a row declared there.
- QingClaw's account and gateway services must preserve the DSH account protocol, `x-dsh-auth-token` contract, model-listing shape, and Messages streaming behavior. The gateway Consumer JWT contract uses the `Bearer ` prefix and `aud=qingclaw-model-gateway`.
- The first release disables account notifications because QingClaw does not yet expose the optional notification endpoints.
- QingClaw 1.0 local-data migration and the existing free and paid skill catalog are deliberately outside the first QingClaw 2.0 slice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep QingClaw-specific plugin rows in this layer. Avoid copying the full upstream Web patch, because a copied roster would turn routine upstream additions into merge work.

</details>
