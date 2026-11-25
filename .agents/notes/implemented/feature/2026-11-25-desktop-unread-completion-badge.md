# Agent Note: Desktop application badge for unread turn completions

Status: implemented

English | [中文](2026-11-25-desktop-unread-completion-badge.zh.md)

## Problem

Sessions finish while the window is hidden or the user is in another application. The only reminder is a status dot on a sidebar row of a window the user is not looking at, so a finished turn is easy to miss. Users expect the application icon to carry the count, as other agent applications do.

The reading records behind [ui-session-status](../../../../packages/client/ui-session-status/README.md) already know which Sessions have an unread completion and already exclude the Session the visible, focused main view shows. The shell therefore needs a count, not another source of reminder state.

## Decision

The Web client reports the number of listed Sessions whose latest completion is unread through a private IPC channel; the Electron main process draws it on the application icon. macOS sets the Dock badge text, Linux sets the launcher count, and Windows draws nothing because Electron exposes no counter badge there. The Dock text caps at `99+`.

The count derives from the status table and the Session list the workspace shows, so it follows the same reminders as the sidebar rows: reading a Session, including by opening it in the focused main view, lowers the count, and subagent Sessions never count. Reloading the plugin and losing the window clear the badge, and a page without the Desktop bridge reports nothing.

## Alternatives considered

**Count completions in the Host.** The Host sees every `turn/end`, but it does not know which Session the user is reading, so it would reproduce the Client reading rules or badge Sessions the user has already seen.

**Post a native notification per completion.** It needs notification permission, is intrusive for a run of short turns, and duplicates the reminder the sidebar already shows.

**Draw a Windows taskbar overlay icon.** Electron offers no counter API on Windows, so an overlay needs a numbered bitmap per count. Windows already carries a tray icon, and the count remains visible in the sidebar.

**Include pending interactions.** Approvals, plan reviews, and questions have their own sidebar state and mean a blocked Session rather than a finished one; counting both would make the number ambiguous.

## Consequences

The badge is a Client-owned count over Host reading records, so two clients of one Host can display different values while their reading records converge. A Session the user archived keeps its reminder and keeps counting until it is marked read, because archive state is workspace state the status package does not read. Windows shows no badge until a counter presentation exists. Nothing reaches a model request, so no Session event or snapshot changes.

Verification covers the publisher (`packages/client/ui-session-status/tests/desktop-badge.client.spec.ts`) and the native badge controller (`apps/desktop/tests/app-badge.spec.ts`); a standalone Electron process running that controller drew the count on the Dock icon. The assembled application badge has no automated coverage.
