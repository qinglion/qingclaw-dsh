# QingClaw management

English | [中文](README.zh.md)

## Summary

The account menu opens QingClaw management for administrators and Creator center for creators. Both open a dedicated panel. The client submits npm package tarballs and shows publication status. Admins can publish or return a submission and change user roles.

The Host authenticates requests to the QingClaw website API using the signed-in account. Package storage and npm publishing run on the website backend.

## Model Experience

None, as account menu navigation does not construct model input.

#### KV Cache effect

None. Marketplace activity uses the account API.

## Known Limitations and Deferred Work

- Submissions accept the .tgz output of npm pack, up to 25 MB.
