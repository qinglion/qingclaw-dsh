# QingClaw Creator Center

English | [中文](README.zh.md)

## Summary

The built-in sidebar workbench is available to QingClaw creators and administrators. It lists the account’s npm packages and their versions. Choose a version to request a market listing. Publishing uses the signed-in QingClaw account.

Create a plugin or a workbench in its own workspace, open an existing directory, or return to a local project. Recognized package directories expose a Release tab in the conversation. It shows project metadata and the package’s release history. The primary action sends a normal request to the current conversation.

## Model Experience

### Publishing a package

#### What the model sees

The Release action requests the bundled `qingclaw-plugin-publish` skill for the selected package directory and exact version. A natural-language publishing request uses the same skill. The skill supplies the account identifier for the `qingclaw_publish_package` tool.

#### Token effect

The instruction includes the local directory, package name and version. Loading the skill adds the publishing steps and the non-secret account identifier. The tool verifies the archive and reports the package name and version. Desktop obtains the publishing credential directly from the website.

#### KV Cache effect

Registry inventory and application state appear only in the UI. The publishing prompt and loaded skill append to the conversation history.
