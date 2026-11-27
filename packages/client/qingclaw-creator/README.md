---
description: "Publish QingClaw packages and request market listings from the Creator center."
kind: "package-reference"
---

# QingClaw Creator Center

English | [中文](README.zh.md)

## Summary

Creators and administrators get a sidebar workbench that lists the account’s npm packages, each with its versions, and requests a market listing for a chosen version. My plugins lists packages under their market titles; Local projects lists registered workspaces with the plugin each root manifest declares. The right Sidebar’s start page offers a Workbench publish card that names the plugin the current Session’s directory declares, writes the publish request into that conversation, and asks it to bump the patch version, publish, and commit the change.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Publishing a package

#### What the model sees

The `qingclaw_publish_package` tool is available in every session of a signed-in creator; the workspace needs no detected plugin. An explicit publishing request loads the bundled `qingclaw-plugin-publish` skill, which supplies the `@qinglion` package name, the exact version, and the account identifier the tool requires. Package directories resolve against the Session's own directory, so a Session created on a branch publishes from its worktree. The tool takes the package directory when the request knows it, reuses the directory this Session published last, and otherwise resolves the one directory whose manifest declares that package and version; equal candidates are refused with the list so the user can choose.

#### Token effect

The tool arguments carry the workspace-relative package directory, the package name, and the version. Loading the skill adds the publishing steps and the non-secret account identifier. The tool verifies the archive built from that directory and reports the package name and version. Desktop obtains the publishing credential directly from the website, and reads the private registry with the account token the workbench Host service exchanges from the same signed-in session.

#### KV Cache effect

Registry inventory and application state appear only in the UI. The publishing prompt and loaded skill append to the conversation history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Local projects reads only each workspace’s root manifest. A package inside a collection workspace is published by naming its directory, not by discovery.
- Publishing needs the resolved package directory to hold a recognized plugin manifest whose name and version match the request. An unnamed request resolves the shallowest such directory; equal-depth matches are refused with the candidates.
- The Session's package choice lives in the Host process. A restarted client asks again the first time a Session publishes.
- The Publish page resolves one directory at a time: the Session directory or the subdirectory the user names. It never enumerates the packages underneath.
- The association lives in this client's local storage per Session; another machine does not carry it.
- Publishing requires an active professional plan: the platform withholds the publishing grant from a free account and the tool asks the creator to upgrade.
- Releases and listing requests accept only `@qinglion/` package names whose exact version exists in the QingClaw registry.
- A listing request is refused until the release declares `qingclaw.name` and `qingclaw.description`, and, for a workbench, `qingclaw.workbench.icon` and at least two `previews`.
- A package published under a shared legacy account has no verified owner, so it appears in the Creator center only after an administrator assigns it.

<a id="dev-note"></a>
### Dev Note

Client and Host suites cover the package inventory, listing requests, workspace discovery, and the publishing tool against recorded account responses.
