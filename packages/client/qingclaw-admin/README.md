# QingClaw management

English | [中文](README.zh.md)

## Summary

Administrators open Plugin management from the QingClaw management account menu. All packages published to the QingClaw registry are visible, including versions without a listing request. Administrators can confirm a maintainer for legacy packages, review requested versions, delist a version and manage user roles.

Creators use their separate Creator center to request a listing for a version they maintain. Delisting a version removes it from the market and preserves the npm artifact.

## Model Experience

None, as account menu navigation does not construct model input.

#### KV Cache effect

None. Marketplace activity uses the account API.

## Known Limitations and Deferred Work

- Listings accept exact versions of packages in the QingClaw registry’s `@qinglion/` scope.
