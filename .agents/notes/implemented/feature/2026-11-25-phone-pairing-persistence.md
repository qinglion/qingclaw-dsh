# Agent Note: Phone pairing survives desktop restarts

Status: implemented

English | [中文](2026-11-25-phone-pairing-persistence.zh.md)

## Problem

The QR code and link a phone scans point at a room the Platform issues for one run of the desktop application. The shell kept that room, its desktop token, and the pairing decision in memory ([remote-mobile-bridge.ts](../../../../apps/desktop/src/mobile/remote-mobile-bridge.ts)), deleted the room on every quit, and created a fresh one the next time the phone window opened. Restarting the desktop therefore invalidated the link on the phone and forced another scan and approval, while users treat that link as a bookmark to their own machine.

## Decision

The desktop stores the room credential in `userData/desktop/mobile-pairing.json` ([pairing-store.ts](../../../../apps/desktop/src/mobile/pairing-store.ts)), tagged with the Platform origin and the account identity, sealed with the platform key store through `safeStorage` when it is available and written owner-only otherwise. Signing in restores the room without opening the management window, so a phone that paired before reconnects as soon as the desktop is online; quitting preserves the room instead of revoking it. An explicit **Disconnect**, signing out, a server revocation, or the room's own expiry still clears the record and revokes access.

Closing the management window no longer stops the relay: the window is a view of the pairing, not its lifetime.

## Alternatives considered

**Create a room per launch from the account credential.** The link carries the room id and pairing secret, so a new room is a new link and a new scan; the credential is also the only thing the persisted record replaces.

**Keep the room in Host-owned storage.** The pairing belongs to the shell's management surface and must outlive a Host restart, which would give that storage an owner with an unrelated lifecycle.

**Skip the revocation on quit without storing anything.** A restart could not re-subscribe without the desktop token, so the phone would still be stranded.

**Store the record in plaintext.** The record grants remote access to the desktop's sessions. The key store protects it at rest and the owner-only mode is the fallback on platforms without one.

## Consequences

The link stays fixed while the Platform room lives, and the Platform keeps it alive: the QingClaw website slides the desktop's website login and its rooms forward to 30 days on every authenticated desktop request and relay heartbeat, and the relay state frame carries the new `expires_at` so this record and its local expiry follow it (`onExtended`). A month without desktop activity, an explicit disconnect, or signing out still ends the pairing and the phone pairs again.

The record is a bearer credential. A read of another OS user's or process's file copy is a compromise until the room expires; the account tag refuses to restore a record written for a different account, and a key-store change degrades to a fresh pairing instead of a stuck window.

Revoking now takes signing out or **Disconnect**; the previous guarantee that quitting ends remote access is gone, and the documentation and window copy say so.

Verification covers storage ([pairing-store.spec.ts](../../../../apps/desktop/tests/pairing-store.spec.ts)), restore and revocation ([mobile-pairing.spec.ts](../../../../apps/desktop/tests/mobile-pairing.spec.ts)), window lifetime ([mobile-pairing-window.spec.ts](../../../../apps/desktop/tests/mobile-pairing-window.spec.ts)), and session replacement ([mobile-account.spec.ts](../../../../apps/desktop/tests/mobile-account.spec.ts)). A real restart against the Platform was exercised only for link stability, not for a paired phone reconnecting.
