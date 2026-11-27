# Agent Note: 手机配对在桌面端重启后保留

Status: implemented

[English](2026-11-25-phone-pairing-persistence.md) | 中文

## Problem

手机扫描的二维码和链接指向平台为桌面应用某一次运行签发的房间。桌面端把该房间、它的 desktop token 和配对决定都保存在内存里（[remote-mobile-bridge.ts](../../../../apps/desktop/src/mobile/remote-mobile-bridge.ts)），每次退出都删除房间，下次打开手机窗口时再签发新的。于是重启桌面端就会让手机上的链接失效，用户必须重新扫码并再次确认；而用户把这个链接当作指向自己电脑的书签。

## Decision

桌面端把房间凭证保存在 `userData/desktop/mobile-pairing.json`（[pairing-store.ts](../../../../apps/desktop/src/mobile/pairing-store.ts)），记录里带上平台来源和账号身份；平台提供密钥库时通过 `safeStorage` 加密，否则只写属主可读的文件。登录后会恢复该房间而不必打开管理窗口，之前配对过的手机在桌面端上线后即可重连；退出应用时保留房间而不是撤销。显式点击**断开连接**、退出账号、服务端撤销或房间自身到期，仍会清除记录并撤销访问。

关闭管理窗口不再停止中继：窗口只是配对的一个视图，不是它的生命周期。

## Alternatives considered

**每次启动都用账号凭证新建房间。** 链接携带房间 id 和配对密钥，新房间就是新链接、要重新扫码；而且持久化记录要替代的正是这份凭证。

**把房间放进 Host 存储。** 配对属于桌面端的管理界面，且必须跨 Host 重启存活，放进 Host 存储会得到一个生命周期不相关的所有者。

**退出时不撤销但也不保存任何东西。** 没有 desktop token 就无法在重启后重新订阅，手机照样会失联。

**以明文保存记录。** 该记录能换取对桌面端会话的远程访问。平台密钥库负责静态加密，没有密钥库的平台以仅属主可读作为兜底。

## Consequences

链接在平台房间存活期间保持不变，而平台会持续续期：桌面端每次通过鉴权的请求和中继心跳都会把这次网站登录及其房间顺延到 30 天后，中继的 state 帧带上新的 `expires_at`，本记录和本地到期时间随之前移（`onExtended`）。整整一个月没有使用、显式断开或退出账号仍会结束配对，手机需要重新配对。

记录是一份持有者凭证。其他系统用户或进程读到文件副本即构成泄露，直到房间过期为止；账号标记会拒绝恢复为其他账号写入的记录，密钥库变更则退化为重新配对，而不是卡住窗口。

撤销访问现在需要退出账号或点击**断开连接**；原先“退出应用即结束远程访问”的保证不再成立，文档和窗口文案都写明了这一点。

验证覆盖存储（[pairing-store.spec.ts](../../../../apps/desktop/tests/pairing-store.spec.ts)）、恢复与撤销（[mobile-pairing.spec.ts](../../../../apps/desktop/tests/mobile-pairing.spec.ts)）、窗口生命周期（[mobile-pairing-window.spec.ts](../../../../apps/desktop/tests/mobile-pairing-window.spec.ts)）和会话替换（[mobile-account.spec.ts](../../../../apps/desktop/tests/mobile-account.spec.ts)）。对平台的真实重启只验证了链接稳定性，没有验证已配对手机的重连。
