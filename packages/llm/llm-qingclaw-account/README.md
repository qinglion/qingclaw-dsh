---
description: "QingClaw account authentication with short-lived model gateway credentials."
kind: "package-reference"
---

# @qinglion/dsh-llm-qingclaw-account

English | [中文](README.zh.md)

## Summary

Register the `deepseek-account` model route for QingClaw. The plugin keeps the existing `deepseekAccount` device session for QingClaw Platform, exchanges it for a 15-minute model JWT, and sends only that short-lived JWT to the QingClaw model gateway.

The Messages transport and catalog rules come from [`@deepseek-ai/dsh-llm-deepseek`](../llm-deepseek/README.md). The default Messages endpoint is `https://api.qingclaw.com/anthropic`; model discovery uses `https://api.qingclaw.com/models`.

## Table of Contents

- [Use this package](#use-this-package)
- [Security and failure boundaries](#security-and-failure-boundaries)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin instead of `@deepseek-ai/dsh-llm-deepseek-account` while keeping the `deepseek-account` provider id. The QingClaw bundle disables the upstream account provider and inserts this plugin under the `llm-qingclaw-account` entry id.

```yaml
- id: llm-deepseek-account
  disabled: true
- insert:
    - id: llm-qingclaw-account
      name: '@qinglion/dsh-llm-qingclaw-account'
      config:
        baseURL: https://api.qingclaw.com/anthropic
```

The plugin posts to `/auth-api/v0/dsh/model_token` on the signed-in Platform origin. Concurrent exchanges for one device session share one request. A JWT stays in memory until 60 seconds before its `exp` claim and is never persisted.

The first authenticated catalog access requests `/models` at the gateway origin. A missing or failed route does not block Messages: before any successful listing, the provider publishes the bundled `deepseek-flash` and `deepseek-v4-pro` entries; after a successful listing, refresh failures retain the last-known catalog.

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/anthropic` | Messages endpoint; its origin also supplies `/models` |
| `modelTokenTimeoutMs` | `30,000` | Deadline for one Platform model-token exchange |
| `modelsTimeoutMs` | `5,000` | Deadline for one model-listing request |
| `modelsMaxAgeMs` | `600,000` | Model-listing refresh interval; `0` refreshes on access only |
| `modelOverrides` | `{}` | Per-model metadata overrides over the remote or bundled catalog |

<a id="security-and-failure-boundaries"></a>
## Security and failure boundaries

The long-lived device token is sent only to the signed-in Platform origin as `X-DSH-Auth-Token: <device token>`. Messages and `/models` receive only `X-DSH-Auth-Token: Bearer <short JWT>`, matching the managed gateway's required value prefix. Deployment headers returned by `deepseekAccount.getPlatformSession()` are preserved for the Platform exchange and are not copied to the gateway.

The deployed Alibaba Cloud AI Gateway uses the built-in Consumer JWT authentication available on the legacy Serverless edition. Its `qingclaw-desktop` consumer holds a local asymmetric JWKS copied from the Platform issuer, reads the token from `X-DSH-Auth-Token` with the `Bearer ` prefix, and identifies the consumer with `aud=qingclaw-model-gateway`. It strips the JWT before forwarding and maps only `quota_key`, `tier`, and `sub` into QingClaw-owned upstream headers. The legacy Serverless edition does not support the plug-in marketplace, so do not document or configure the separate `jwt-auth` plug-in or `remote_jwks` for this deployment. Key rotation must overlap old and new public keys in the Consumer JWKS before the Platform starts issuing with the new key.

A gateway HTTP 401 clears only the exact rejected short JWT, so the next request exchanges a new one without signing the user out. Only an HTTP 401 from `/auth-api/v0/dsh/model_token` rejects the matching long-lived device session. HTTP 403 from that endpoint reports an account entitlement failure without clearing login state.

<a id="dev-note"></a>
## Dev Note

Focused tests cover single-flight exchange, expiry, response validation, Platform and gateway 401 boundaries, Loader namespace composition, bundled catalog fallback on `/models` 404, and successful Messages streaming with the short JWT.

<a id="model-experience"></a>
## Model Experience

### Authenticated model requests

#### What the model sees

Requests on `deepseek-account` add no model-visible text. The shared Messages transport serializes the request.

#### Token effect

Authentication and catalog retrieval add no input tokens. The resolved catalog still determines context windows and default output limits.

#### KV Cache effect

Neither the device session nor the model JWT enters model input, so exchanging or refreshing credentials does not change the prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Token and listing caches are process-local and reset on restart.
- The gateway must validate the model JWT audience and claims; the desktop client only validates lifetime metadata before use.
- The legacy Serverless gateway needs VPC public NAT/SNAT before its AI service can reach the public DeepSeek endpoint.
- Without `/models`, the bundled catalog can lag behind gateway-side model availability until the route is enabled or the desktop bundle updates.
