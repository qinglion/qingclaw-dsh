---
description: "QingClaw account authentication with short-lived model gateway credentials."
kind: "package-reference"
---

# @qinglion/dsh-llm-qingclaw-account

English | [中文](README.zh.md)

## Summary

Register QingClaw account models under the existing `deepseek-account` provider ID. Saved conversations and model selections use this ID.

The desktop client sends text, images, tool calls and tool results to the OpenAI-compatible `POST /v1/chat/completions` endpoint. The QingClaw website supplies the signed-in model catalog.

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
        baseURL: https://api.qingclaw.com/v1
```

The signed-in platform issues a catalog JWT at `/auth-api/v0/dsh/model_token` and a per-user gateway key at `/auth-api/v0/dsh/model_key`. Each exchange is shared across concurrent requests for the same session.

The desktop bundle sets `catalogURL` to the website’s `/auth-api/v0/dsh/models`. A failed refresh retains the cached catalog, and no models are advertised before the first successful listing. Each model is named by its catalog id: the provider keeps no display names of its own.

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/v1` | OpenAI-compatible API root |
| `modelTokenTimeoutMs` | `30,000` | Deadline for one Platform model-token exchange |
| `modelsTimeoutMs` | `5,000` | Deadline for one model-listing request |
| `modelsMaxAgeMs` | `600,000` | Model-listing refresh interval; `0` refreshes on access only |
| `modelOverrides` | `{}` | Per-model metadata overrides layered over the website catalog entry |

<a id="security-and-failure-boundaries"></a>
## Security and failure boundaries

The client sends its device credential only to the signed-in website. Model discovery sends `X-DSH-Auth-Token: Bearer <catalog JWT>` to the catalog endpoint. Chat completions send `Authorization: Bearer <user gateway key>` to the inference gateway.

Configure consumer authentication and the desktop consumer group on the gateway’s Chat Completions route so usage is attributed to the signed-in account.

A gateway HTTP 401 invalidates the rejected consumer key. The client obtains another key from the platform on the next request.

<a id="dev-note"></a>
## Dev Note

Provider tests exercise platform credential exchange, model discovery and streaming chat requests through the registered account provider.

<a id="model-experience"></a>
## Model Experience

### Authenticated model requests

#### What the model sees

`POST /v1/chat/completions` carries the conversation, attachments and tool definitions. The provider adds no model-visible authentication text.

#### Token effect

Authentication and catalog retrieval add no input tokens. The resolved catalog still determines context windows and default output limits.

#### KV Cache effect

Neither the device session nor the model JWT enters model input, so exchanging or refreshing credentials does not change the prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Token and listing caches are process-local and reset on restart.
- The gateway enforces consumer access and quota.
- No model is advertised until the website catalog answers, so a signed-in client that cannot reach the website cannot start a conversation.
