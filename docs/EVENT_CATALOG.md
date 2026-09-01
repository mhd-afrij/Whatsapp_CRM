# EVENT CATALOG — Socket.IO Realtime Events

## 1. Transport Summary

Two logical namespaces served from the single Socket.IO server run by `whatsapp-gateway` (see
`03-system-architecture.md` §4 and `DECISIONS.md` D6):

- `/gateway` namespace — events originating directly from WhatsApp/message pipeline, emitted
  natively by gateway code.
- `/crm` namespace — CRM-domain events (notifications, assignment, presence, notes) published by
  `backend` to Redis and relayed onto this namespace by a bridge process inside the gateway.

The frontend's `SocketProvider` connects to both namespaces with the same auth handshake
(session cookie / short-lived socket token issued by `GET /auth/me`), joins rooms per §2, and
routes incoming events into TanStack Query cache updates.

## 2. Room / Channel Naming Convention

| Room pattern | Joined by | Purpose |
|---|---|---|
| `workspace:{workspaceId}` | every connected authenticated client | workspace-wide broadcasts (e.g. `connection.updated`) |
| `workspace:{workspaceId}:conversation:{conversationId}` | clients currently viewing that conversation | message/typing/read events scoped to one chat |
| `workspace:{workspaceId}:user:{userId}` | that user's own client(s) (may be multiple tabs/devices) | personal notifications, presence-of-others updates, assignment alerts |
| `workspace:{workspaceId}:team:{teamId}` | members of that team | team-scoped conversation assignment broadcasts |
| `workspace:{workspaceId}:inbox` | any client viewing the conversation list | conversation list-level updates (new conversation, status/assignment change) without needing to be inside the conversation |

A client joins `workspace:{id}`, `workspace:{id}:user:{myId}`, and `workspace:{id}:inbox` on
connect; it joins/leaves `workspace:{id}:conversation:{cid}` as the user navigates in/out of a
specific chat.

## 3. Event Definitions

### `message.created`
- **Namespace**: `/gateway`
- **Emitted by**: gateway, immediately after persisting an inbound or outbound message row.
- **Rooms**: `workspace:{workspaceId}:conversation:{conversationId}`, `workspace:{workspaceId}:inbox`
- **Payload**:
```json
{
  "message": {
    "id": 123, "conversationId": 45, "direction": "inbound",
    "messageType": "text", "body": "Hello", "status": "sent",
    "senderType": "contact", "sentAt": "2026-07-31T10:00:00Z"
  },
  "conversation": { "id": 45, "lastMessagePreview": "Hello", "unreadCount": 3 }
}
```

### `message.updated`
- **Namespace**: `/gateway`
- **Emitted by**: gateway, on status transitions not covered by `message.failed` (e.g.
  delivered/read receipts, reaction added).
- **Rooms**: `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "messageId": 123, "changes": { "status": "delivered" } }`

### `message.failed`
- **Namespace**: `/gateway`
- **Emitted by**: gateway's outbound worker when a send exhausts retries.
- **Rooms**: `workspace:{workspaceId}:conversation:{conversationId}`, `workspace:{workspaceId}:user:{requestedByUserId}`
- **Payload**: `{ "messageId": 123, "conversationId": 45, "errorMessage": "Number not on WhatsApp", "attempts": 3 }`

### `conversation.created`
- **Namespace**: `/gateway`
- **Emitted by**: gateway, when a new inbound contact creates a first-time conversation row.
- **Rooms**: `workspace:{workspaceId}:inbox`
- **Payload**: `{ "conversation": { "id": 45, "whatsappContactId": 9, "status": "open", "createdAt": "..." } }`

### `conversation.updated`
- **Namespace**: `/gateway` (WhatsApp-derived fields) — generic envelope also reused by the
  `/crm` relay for CRM-derived field changes (status, unread reset, etc.)
- **Emitted by**: gateway (last_message_at/preview/unread_count changes) or backend→relay
  (non-assignment/close CRM field edits).
- **Rooms**: `workspace:{workspaceId}:inbox`, `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "conversationId": 45, "changes": { "unreadCount": 0 } }`

### `conversation.assigned`
- **Namespace**: `/crm`
- **Emitted by**: backend, on `PATCH /conversations/{id}/assign`.
- **Rooms**: `workspace:{workspaceId}:inbox`, `workspace:{workspaceId}:user:{newAssigneeId}`, `workspace:{workspaceId}:team:{teamId}` (if team-assigned)
- **Payload**: `{ "conversationId": 45, "assignedUserId": 7, "assignedTeamId": null, "assignedBy": 2, "assignedAt": "..." }`

### `conversation.closed`
- **Namespace**: `/crm`
- **Emitted by**: backend, on `PATCH /conversations/{id}/close`.
- **Rooms**: `workspace:{workspaceId}:inbox`, `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "conversationId": 45, "closedBy": 2, "closedAt": "..." }`

### `conversation.reopened`
- **Namespace**: `/crm`
- **Emitted by**: backend, on `PATCH /conversations/{id}/reopen`.
- **Rooms**: `workspace:{workspaceId}:inbox`, `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "conversationId": 45, "reopenedBy": 2, "reopenedAt": "..." }`

### `conversation.read`
- **Namespace**: `/gateway` (unread_count is gateway-owned) — triggered by
  `POST /conversations/{id}/read` on backend which calls the gateway internal API to reset the
  counter, or directly by gateway when it detects a WhatsApp-side read receipt from the agent's
  linked device.
- **Rooms**: `workspace:{workspaceId}:inbox`, `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "conversationId": 45, "readByUserId": 7, "readAt": "..." }`

### `contact.created` / `contact.updated` / `contact.deleted`
- **Namespace**: `/gateway` (relayed from the backend via `POST /internal/whatsapp/events/emit`
  — see `GatewayClient::emitEvent` and `ContactController::relayContactEvent`)
- **Emitted by**: backend, on `POST /contacts`, `PATCH /contacts/{id}`, `DELETE /contacts/{id}`
  (archive), and `POST /contacts/{id}/restore` (emitted as `contact.updated`).
- **Rooms**: `workspace:{workspaceId}`, `workspace:{workspaceId}:inbox` (contacts are
  workspace-shared, so the contacts list/detail UI joins the inbox room).
- **Payload**: `{ "contact_id": 456 }`

### `note.created`
- **Namespace**: `/crm`
- **Emitted by**: backend, on `POST /notes`.
- **Rooms**: `workspace:{workspaceId}:conversation:{conversationId}` (if note attached to a
  conversation) filtered client-side by `is_private`/mention visibility rules already enforced
  server-side (a private note is only ever emitted into the rooms of users allowed to see it:
  the author, mentioned users, and anyone with `notes.view_private`) — additionally direct-sent
  to `workspace:{workspaceId}:user:{mentionedUserId}` for each mention.
- **Payload**: `{ "note": { "id": 8, "conversationId": 45, "authorId": 2, "body": "...", "isPrivate": false, "mentions": [7] } }`

### `presence.updated`
- **Namespace**: `/crm`
- **Emitted by**: backend (heartbeat-driven) or gateway bridge on socket connect/disconnect.
- **Rooms**: `workspace:{workspaceId}` (broadcast — presence is workspace-wide, used in an
  agent-list sidebar)
- **Payload**: `{ "userId": 7, "status": "online", "lastActiveAt": "..." }`

### `typing.updated`
- **Namespace**: `/gateway` (agent-side typing) and relayed from WhatsApp's own typing signal
  (contact-side typing) where available.
- **Emitted by**: gateway, on ephemeral typing start/stop (not persisted to DB).
- **Rooms**: `workspace:{workspaceId}:conversation:{conversationId}`
- **Payload**: `{ "conversationId": 45, "actorType": "user", "actorId": 7, "isTyping": true }`

### `notification.created`
- **Namespace**: `/crm`
- **Emitted by**: backend, whenever a `notifications` row is inserted (task due, mention,
  assignment, WhatsApp disconnect alert, etc.), filtered by the recipient's
  `notification_preferences.in_app_enabled`.
- **Rooms**: `workspace:{workspaceId}:user:{userId}`
- **Payload**: `{ "notification": { "id": "uuid", "type": "ConversationAssigned", "data": { "conversationId": 45 }, "createdAt": "..." } }`

### `connection.updated`
- **Namespace**: `/gateway`
- **Emitted by**: gateway, on every `whatsapp_sessions.status` transition (qr_pending →
  connected → disconnected → logged_out, etc.), including QR payload updates.
- **Rooms**: `workspace:{workspaceId}` (broadcast; consumed by the WhatsApp connection settings
  page, and to drive a workspace-wide banner if disconnected)
- **Payload**: `{ "status": "qr_pending", "qrCode": "data:image/png;base64,...", "qrExpiresAt": "...", "phoneNumber": null }`

## 4. Client Subscription Summary (frontend)

| UI surface | Events consumed |
|---|---|
| Conversation list | `conversation.created`, `conversation.updated`, `conversation.assigned`, `conversation.closed`, `conversation.reopened`, `conversation.read`, `message.created` (for preview/unread) |
| Contacts list / detail | `contact.created`, `contact.updated`, `contact.deleted` (via `useContactRealtime`) |
| Active chat panel | `message.created`, `message.updated`, `message.failed`, `typing.updated`, `conversation.read`, `note.created` |
| Notification bell | `notification.created` |
| Agent presence sidebar | `presence.updated` |
| WhatsApp settings page | `connection.updated` |
