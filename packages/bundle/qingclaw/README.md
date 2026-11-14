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

Production defaults to `https://qingclaw.com` for account authorization and `https://api.qingclaw.com` for inference. An unpackaged development launch may set `QINGCLAW_PLATFORM_ORIGIN` and `QINGCLAW_INFERENCE_ORIGIN`. Packaged Desktop does not trust those values from the user's login shell: the test packaging preset seals `https://beta.qingclaw.com` and `https://api.qingclaw.com` into its signed application manifest, while the production preset seals `https://qingclaw.com` and the same inference origin. Desktop validates the exact deployment/origin tuple before starting the Host and applies it after reading the login shell, so ambient variables cannot redirect a packaged account or model request.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The patch targets existing account, model, Web, notification, and official-brand row ids. It replaces only their complete configuration or enabled state, then inserts QingClaw-owned plugin rows. The account service retains DSH's browser authorization, local PKCE callback, credential storage, and account-model selection while QingClaw's Rails platform implements the compatible server protocol. Its `inferenceOrigin` release boundary deliberately remains on the Platform origin: generic account-token consumers therefore cannot release the 30-day device session to `api.qingclaw.com`. The model provider separately owns the gateway origin, exchanges that device session for a short-lived model JWT, and sends only `X-DSH-Auth-Token: Bearer <model JWT>` to the QingClaw gateway; the upstream provider key never reaches Desktop. The deployed legacy Serverless gateway authenticates it with built-in Consumer JWT and a local asymmetric JWKS, not the unsupported plug-in marketplace `jwt-auth`/`remote_jwks` path.

The first QingClaw release disables both upstream DeepSeek Web backends. They resolve the long-lived account grant and cannot reuse the QingClaw model provider's private short-JWT cache; the gateway also has no `/v1/tools/search` or `/v1/tools/fetch` route yet. The distribution plugin applies `tools.restrict()` to each Agent scope, so presets that declare `web_search` do not expose it to the model. Anonymous `web_fetch` remains available through the `http` provider and never reads an account credential. Re-enable gateway-backed search only after a shared short-token seam and the gateway tools route exist, with a test that the request carries the `Bearer `-prefixed model JWT and never the device session. The bundle also disables the DeepSeek session-log and active-plugin inventory contributors, so QingClaw Messages requests omit the `dsh_session_log` and `dsh_plugin_packages` top-level fields. The bundle does not copy the Web roster. Later QingClaw business features can join this bundle as additional plugin rows without changing the DSH agent loop.

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

The model sees no extra prompt text and no `web_search` declaration. The standard, PTC, and Cordis presets retain anonymous `web_fetch`; the minimal preset has neither Web tool. The selected account provider sends its requests through the QingClaw inference origin, keeping authentication in the `X-DSH-Auth-Token` header, and receives the gateway's advertised model catalog.

#### Token effect

The layer adds no prompt text. Relative to the upstream Web presets, it removes the `web_search` schema and its conditional guidance. It sets 8,192 as the QingClaw account route's default maximum output, and the resolved model catalog does not advertise a larger route limit. Inference usage still depends on the selected model and request.

#### KV Cache effect

The QingClaw request prefix consistently omits `web_search` for presets that otherwise declare it. The layer does not rewrite conversation messages; changing presets still changes the tool catalog and its request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This bundle must follow the Web application layer because it targets a row declared there.
- QingClaw's account and gateway services must preserve the DSH account protocol, `x-dsh-auth-token` contract, model-listing shape, and Messages streaming behavior. The gateway Consumer JWT contract uses the `Bearer ` prefix and `aud=qingclaw-model-gateway`.
- The 8,192-token route setting is a client-side default and catalog bound, not a security boundary. The gateway must reject or account for modified-client requests independently.
- The first release disables account notifications because QingClaw does not yet expose the optional notification endpoints.
- The first release hides `web_search` and disables DeepSeek-backed Web search and DeepSeek Web fetch. Anonymous HTTP page fetch remains enabled; gateway-backed search waits for a shared short-model-JWT credential seam and `/v1/tools` routes.
- QingClaw 1.0 local-data migration and the existing free and paid skill catalog are deliberately outside the first QingClaw 2.0 slice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep QingClaw-specific plugin rows in this layer. Avoid copying the full upstream Web patch, because a copied roster would turn routine upstream additions into merge work.

</details>
