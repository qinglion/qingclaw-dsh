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
- [Media tools](#media-tools)
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

The desktop bundle sets `catalogURL` to the website’s `/auth-api/v0/dsh/models`. A failed refresh retains the cached catalog, and no models are advertised before the first successful listing. Each model is named by its catalog id: the provider keeps no display names of its own. A listed `rate` is the model's uncached input price divided by the deployment default's standard input price, which the website recomputes on every sync and when the default changes; the provider forwards it as display metadata.

The listing's `default` entry becomes the deployment default only while the saved default is deployment-owned. A selection saved as an explicit user choice survives catalog refreshes; once that model leaves the listing, the website default applies again and the saved default returns to deployment ownership.

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.qingclaw.com/v1` | OpenAI-compatible API root |
| `modelTokenTimeoutMs` | `30,000` | Deadline for one Platform model-token exchange |
| `modelsTimeoutMs` | `5,000` | Deadline for one model-listing request |
| `modelsMaxAgeMs` | `600,000` | Model-listing refresh interval; `0` refreshes on access only |
| `modelOverrides` | `{}` | Per-model metadata overrides layered over the website catalog entry |

<a id="media-tools"></a>
## Media tools

The plugin registers `image_generate`, `video_generate`, and `video_get` whenever the composition provides a tool registry. They authenticate with the same gateway key as Chat Completions and return the gateway's JSON answer unchanged.

Each generation first asks the website for a charge ticket through `/auth-api/v0/dsh/media/authorize`. The website debits the account and lowers its gateway quota by the exact cost, then returns a two-minute ticket. A 402 surfaces the website's insufficient-credit message and the gateway is never called. The gateway media route requires `X-QingClaw-Media-Ticket`; the plugin settles on success and refunds when the provider call fails.

`video_generate` creates one asynchronous task on `/video/api/v1/services/aigc/video-generation/video-synthesis`. The model routes on the media slots, so this one route covers text-to-video, first-frame animation, reference composition, video editing, and extension:

| Field | Meaning |
|---|---|
| `prompt` | Required description; address media as "image 1", "video 1", or "audio 1" in send order |
| `seconds` | Whole seconds from 2 to 30, or `auto` for the model-chosen length; defaults to 5 |
| `size` | Output pixels such as `1280x720`; 480, 720, and 1080 select the resolution tier; defaults to 480P |
| `ratio` | `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, or `9:16`; omitted follows the media |
| `sound` | Whether the clip carries an audio track; the gateway default is on |
| `firstFrame` / `lastFrame` | Pictures the clip starts or ends on |
| `images` | Up to 10 reference images |
| `videos` | Up to 5 hosted reference videos (mp4/mov, 15 seconds in total) |
| `audios` | Up to 5 hosted reference audio tracks (mp3/wav, 15 seconds in total) |

Frame animation and reference composition are exclusive: one call sends either `firstFrame`/`lastFrame` or `images`/`videos`/`audios`, because the gateway refuses to mix task types.

Local image paths are read through the session filesystem service and sent as `data:` URLs, so the bytes never enter the conversation. Images accept `jpg`, `jpeg`, `png`, `webp`, and `bmp` up to 20 MB. Reference videos and audio are fetched by the gateway, so they need an `https` or `oss://` URL.

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
- `video_generate` does not expose the `file` and `link` media slots, so documents and web pages cannot be used as video references yet.