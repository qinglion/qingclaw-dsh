---
description: "Publish QingClaw packages and request market listings from the Creator center."
kind: "package-reference"
---

# QingClaw Creator Center

English | [中文](README.zh.md)

## Summary

The built-in sidebar workbench is available to QingClaw creators and administrators. It lists the account’s npm packages and their versions. Choose a version to request a market listing. Publishing uses the signed-in QingClaw account.

My plugins lists each package under its market listing title and keeps the package name beneath it. Recognized package directories expose a Release tab in the conversation. It shows project metadata and the package’s release history. The primary action sends a normal request to the current conversation.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Publishing a package

#### What the model sees

The Release action requests the bundled `qingclaw-plugin-publish` skill for the selected package directory and exact version. A natural-language publishing request uses the same skill. The skill supplies the account identifier for the `qingclaw_publish_package` tool.

#### Token effect

The instruction includes the local directory, package name and version. Loading the skill adds the publishing steps and the non-secret account identifier. The tool verifies the archive and reports the package name and version. Desktop obtains the publishing credential directly from the website, and reads the private registry — the version history and the pre-publish version check — with the account token the workbench Host service exchanges from the same signed-in session.

#### KV Cache effect

Registry inventory and application state appear only in the UI. The publishing prompt and loaded skill append to the conversation history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Releases and listing requests accept only `@qinglion/` package names whose exact version exists in the QingClaw registry.
- A package published under a shared legacy account has no verified owner, so it appears in the Creator center only after an administrator assigns it.

<a id="dev-note"></a>
### Dev Note

Client and Host suites cover the package inventory, listing requests, release history and the publishing tool against recorded account responses.
