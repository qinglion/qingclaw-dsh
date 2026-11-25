# Agent Note: Read the QingClaw private registry with the signed-in account

Status: implemented

English | [中文](2026-11-24-qingclaw-private-registry-reads.zh.md)

## Problem

`https://npm.qingclaw.com/` answered every `@qinglion` read anonymously. The workbench catalog names an exact version, and both the README download and the plugin manager's `pnpm add` fetched that tarball without credentials, so anyone holding the URL could install a published workbench or read its archive. Publishing already required a signed-in creator grant; reading did not.

## Decision

- The platform issues a read grant only to an account with an active professional plan (an unexpired `pro` entitlement); a free account's request answers 402 `pro_required`, so no registry credential ever reaches it. The grant itself is issued at: `POST /auth-api/v0/dsh/registry/read-grant` on the account origin, authenticated with the same platform session headers as the publish flow (`X-DSH-Auth-Token` plus the session's request headers), answering `{ username, password, registry, expires_at }` in the publish grant's form. That endpoint lives in the QingClaw website application; the client validates every field it returns before using it.
- [`@qinglion/dsh-qingclaw-workbench`](../../../../packages/client/qingclaw-workbench/README.md) performs the exchange. `WorkbenchRegistryAccess` turns the grant into a registry bearer token through `PUT -/user/org.couchdb.user:<username>` and caches it until 60 seconds before `expires_at`, keyed by registry, account origin, and session token, so another sign-in never reuses the previous account's token. README archives are read with `Authorization: Bearer`. The deployment names that registry with the workbench `registry` setting, which catalog entries must match and which defaults to the official URL. Other product Host plugins read through `registryAuthorization(registry)` on that same service, which adds no Remote surface: the creator plugin's version history and its pre-publish version check use it, while the token its publish login already produces covers the check inside the publish flow itself.
- [`@deepseek-ai/dsh-plugin-manager`](../../../../packages/boot/plugin-manager/README.md) accepts `authToken` on `installBundle` and hands it to pnpm as `npm_config_//<host>/:_authToken` in the run's environment, so the pre-install registry lookup, the packument request, and the tarball download all authenticate. The token enters neither the command line, the install log, nor the profile.
- The registry answers `@qinglion/*` reads only to an authenticated user. The website therefore reads package inventories, listing checks, and publish verification with its own read-only registry identity (`PLUGIN_REGISTRY_SERVICE_USERNAME`/`PLUGIN_REGISTRY_SERVICE_PASSWORD` on the website, `QINGCLAW_REGISTRY_SERVICE_*` on the registry), which can read and cannot publish.

`qingclawWorkbench.installWorkbench(name, version)` installs on the Host, so the browser requests an installation without receiving the registry credential. A README read and an installation both report that sign-in is required when the account has no platform session: the Host answers with the `qingclaw-workbench/sign-in-required` failure code, and the workbench page shows a sign-in message instead of the generic retry copy.

### Ownership

| Owner | Holds | Never holds |
|---|---|---|
| Platform read-grant endpoint | Account identity and npm credential issuance | — |
| `WorkbenchRegistryAccess` | The bearer token and its expiry | The profile, logs, the renderer |
| `plugin-manager` | One installation's token, as an environment entry | argv, install logs, `.npmrc` files |
| Browser | Catalog and installed state | Any registry credential |

## Alternatives considered

**Signed tarball URLs served by the platform.** A signed URL would keep npm credentials off the client, but pnpm still resolves a workbench's `@qinglion` dependencies through the registry, so dependency reads would stay anonymous or need a second mechanism. Rejected as two mechanisms for one access rule.

**Writing the token into the profile `.npmrc`.** pnpm reads registry credentials from `.npmrc`, but such a file persists a secret across every later package operation and sits in a user-visible directory. Rejected in favor of a value that lasts one run.

**Passing the token as a `--config.` argument.** pnpm accepts that form, but the manager streams its argv into `plugin-manager/install-log`, which would persist the token in diagnostics. Rejected.

**Letting the browser call `installBundle` with a token.** The renderer would hold the registry credential, where any injected script could read it. Rejected in favor of the Host-side install.

## Testing

`packages/client/qingclaw-workbench/tests/registry-auth.host.spec.ts` pins the exchange: reused cache, refresh margin, account switch, concurrent reads, refused and malformed grants, and invalid tokens. `readme.host.spec.ts` pins the authorized archive read, and `packages/boot/plugin-manager/tests/manager.spec.ts` pins the environment entry together with its absence from argv and the install log. The creator package pins the authorized version history and pre-publish check. The whole path was verified end to end against a local Rails website and a Verdaccio 7 registry with the shipped auth plugin and `access: $authenticated`: anonymous reads answer 401, a read grant reads metadata and tarballs, its generation cannot publish, and the real install and publish flows complete. The workbench Host service itself was then driven against that stack with its catalog and a pnpm-backed installer: catalog parse, README read, and installation succeeded, and a signed-out account received `qingclaw-workbench/sign-in-required` from both the read and the installation.

## Consequences

- Reading a README and installing from the workbench directory now require a signed-in QingClaw account.
- Rollout has a fixed order: deploy the read-grant endpoint and the website's service identity first, release the client that carries the grant second, and require authentication in the registry last. A client without the grant loses workbench reads and installations once authentication is required, and a client released before the endpoint gets no grant at all.
- The token is a read credential for the account. A build script of an installed package runs with the token in its environment; the exposure is bounded by its read-only scope and the grant's expiry.
- Publishing now logs in before its version check, so an already-published version also performs one login it previously skipped.
