# Agent Note: 用已登录账号读取青狮私有 npm

Status: implemented

[English](2026-11-24-qingclaw-private-registry-reads.md) | 中文

## Problem

`https://npm.qingclaw.com/` 对所有 `@qinglion` 读取都匿名应答。工作台目录指定确切版本，README 下载与插件管理器的 `pnpm add` 都不带凭据地拉取该压缩包，任何拿到链接的人都能安装已上架的工作台或读取其压缩包。发布早已要求已登录的创作者授权，读取没有。

## Decision

- 平台只为持有有效专业版授权（未过期的 `pro` 权益）的账号签发读取与发布授权；免费账号的请求返回 402 `pro_required`，拿不到任何私服凭据，免费创作者会被要求先升级再发布。授权端点为：在账号源上 `POST /auth-api/v0/dsh/registry/read-grant`，用与发布流程相同的平台会话请求头认证（`X-DSH-Auth-Token` 加上会话自带的请求头），返回与发布授权同形的 `{ username, password, registry, expires_at }`。该端点位于青狮官网应用内，客户端在使用前会校验它返回的每个字段。
- [`@qinglion/dsh-qingclaw-workbench`](../../../../packages/client/qingclaw-workbench/README.zh.md) 完成交换。`WorkbenchRegistryAccess` 用 `PUT -/user/org.couchdb.user:<username>` 把授权换成 npm 读取令牌，并缓存到 `expires_at` 前 60 秒；缓存键包含注册表、账号源和会话令牌，因此更换登录账号不会复用上一个账号的令牌。读取 README 压缩包时带上 `Authorization: Bearer`。部署用工作台的 `registry` 配置指定这个私服，目录条目必须与它一致，默认是官方地址。产品内的其他 Host 插件通过同一服务上的 `registryAuthorization(registry)` 读取，该接口不新增 Remote 接口：创作者中心的版本历史与发布前的版本核对都使用它，而发布流程内部的核对则由发布登录本身得到的令牌覆盖。
- [`@deepseek-ai/dsh-plugin-manager`](../../../../packages/boot/plugin-manager/README.zh.md) 的 `installBundle` 接受 `authToken`，以 `npm_config_//<主机>/:_authToken` 放进这次运行的 pnpm 环境，因此安装前的注册表查询、包元数据请求与压缩包下载都会认证。令牌不进入命令行、安装日志或 profile。
- 私服只对已登录用户开放 `@qinglion/*` 读取，因此官网用自身的只读 npm 身份（官网侧 `PLUGIN_REGISTRY_SERVICE_USERNAME`/`PLUGIN_REGISTRY_SERVICE_PASSWORD`，私服侧 `QINGCLAW_REGISTRY_SERVICE_*`）读取包清单、上架核对与发布校验；该身份可读不可发布。

`qingclawWorkbench.installWorkbench(name, version)` 在 Host 内安装，浏览器发起安装时不会拿到 npm 凭据。账号没有平台会话时，读取 README 与安装都会以 `qingclaw-workbench/sign-in-required` 失败码告知需要登录，工作台页面因此显示登录提示，而不是通用的重试文案。

### 持有关系

| 持有者 | 持有 | 从不持有 |
|---|---|---|
| 平台读取授权端点 | 账号身份与 npm 凭据签发 | — |
| `WorkbenchRegistryAccess` | Bearer 令牌及其到期时间 | profile、日志、渲染进程 |
| `plugin-manager` | 单次安装的令牌，仅作环境变量 | 命令行、安装日志、`.npmrc` 文件 |
| 浏览器 | 目录与安装状态 | 任何 npm 凭据 |

## Alternatives considered

**由平台签发压缩包直链。** 直链可以让客户端不碰 npm 凭据，但 pnpm 仍要通过注册表解析工作台依赖的 `@qinglion` 包，依赖读取要么继续匿名，要么再引入一套机制。因一条访问规则要用两套机制而被否决。

**把令牌写入 profile 的 `.npmrc`。** pnpm 会读取 `.npmrc` 中的注册表凭据，但该文件会把密钥留到之后每一次包操作，且位于用户可见目录。否决，改用只存在于一次运行的值。

**用 `--config.` 参数传令牌。** pnpm 接受这种写法，但管理器会把命令行流入 `plugin-manager/install-log`，令牌因此留在诊断记录里。否决。

**让浏览器带着令牌调用 `installBundle`。** 渲染进程会持有 npm 凭据，任何注入的脚本都能读到。否决，改为在 Host 内安装。

## Testing

`packages/client/qingclaw-workbench/tests/registry-auth.host.spec.ts` 固定交换行为：缓存复用、刷新边界、换账号、并发读取、被拒绝与格式错误的授权、无效令牌。`readme.host.spec.ts` 固定带认证的压缩包读取，`packages/boot/plugin-manager/tests/manager.spec.ts` 固定环境变量注入以及它不出现在命令行和安装日志中。创作者包固定了带认证的版本历史与发布前核对。整条链路已在本地 Rails 官网与带官方认证插件、`access: $authenticated` 的 Verdaccio 7 上端到端验证：匿名读取返回 401，读取授权可取元数据与压缩包，其 generation 无法发布，真实的安装与发布流程都能完成。随后又用工作台 Host 服务本身对接这套栈（自带目录与 pnpm 安装器）跑通：目录解析、README 读取与安装全部成功，未登录时读取与安装都返回 `qingclaw-workbench/sign-in-required`。

## Consequences

- 从工作台目录读取 README 与安装，现在都需要已登录的青狮账号。
- 上线有固定顺序：先部署读取授权接口与官网服务身份，再发布带读取授权的客户端，最后才在私服要求认证。没有读取授权的客户端在开启认证后失去工作台读取与安装能力；在接口上线前发布的客户端则拿不到任何授权。
- 令牌是账号的读取凭据：已安装包的构建脚本会在环境中看到它，暴露面受只读范围与授权到期时间约束。
- 发布现在会先登录再做版本核对，因此「版本已存在」的情形也会多做一次此前会跳过的登录。
