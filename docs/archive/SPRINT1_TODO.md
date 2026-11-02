# Sprint 1 — Agent Productivity (Saved Replies, Quick Replies, Typing, Presence, Read/Unread, Reactions)

## Goals
- [ ] Backend: `message_templates` migration + model + policy + controller + routes + permissions + audit
- [ ] Backend: template variable-resolution service
- [ ] Gateway: typing internal route (`sendPresenceUpdate`) + Socket.IO `typing.updated`
- [ ] Gateway: outbound reaction internal route (send/react, persist `message_reactions`, emit events)
- [ ] Gateway: Redis-backed presence heartbeat + Socket.IO `presence.updated`
- [ ] Backend: presence heartbeat endpoint + per-user unread endpoint + outbound reaction proxy
- [ ] Frontend: template management page + saved-replies picker + slash commands
- [ ] Frontend: typing indicator + presence avatars + reaction picker + read/unread UI
- [ ] Update docs (EVENT_CATALOG, API contract, permission matrix)
- [ ] Run full test/lint/build/migration verification

## Status tracker
- [x] Inspect baseline (done in plan)
