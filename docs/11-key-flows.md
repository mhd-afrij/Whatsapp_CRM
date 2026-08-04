# 11 — Key Flows

Five core sequence/flow diagrams referenced throughout this documentation set.

## 1. Incoming Message Lifecycle

WhatsApp → gateway → DB → socket → frontend.

```mermaid
sequenceDiagram
    participant WA as WhatsApp
    participant GW as whatsapp-gateway (Baileys)
    participant DB as MySQL
    participant MinIO as MinIO
    participant SIO as Socket.IO (/gateway)
    participant FE as Frontend (agent browser)

    WA->>GW: incoming message event (Baileys socket)
    GW->>GW: normalize payload (jid, type, content)
    GW->>DB: upsert whatsapp_contacts (by wa_jid)
    GW->>DB: find-or-create conversations row
    alt has media
        GW->>WA: fetch media stream
        GW->>MinIO: store object, generate thumbnail
        GW->>DB: insert message_media
    end
    GW->>DB: insert messages (workspace_id, whatsapp_message_id) UNIQUE
    Note over GW,DB: duplicate delivery -> unique constraint violation caught, treated as no-op
    GW->>DB: update conversations.last_message_at / preview / unread_count
    GW->>SIO: emit message.created (room: conversation + inbox)
    SIO-->>FE: message.created
    FE->>FE: TanStack Query cache patch, append to chat, bump inbox preview
    FE-->>WA: (implicit) delivery receipt handled by Baileys automatically
```

## 2. Outgoing Message Lifecycle

Frontend → backend/gateway → BullMQ → Baileys → WhatsApp → status updates.

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as backend (Laravel)
    participant GW as whatsapp-gateway
    participant Q as BullMQ (outbound-messages)
    participant WA as WhatsApp
    participant SIO as Socket.IO (/gateway)

    FE->>BE: POST /api/v1/conversations/{id}/messages
    BE->>BE: authorize (conversations.reply), validate (Form Request)
    BE->>DB: insert message_dispatch_queue (status=pending)
    BE->>GW: POST /internal/gateway/send-message (shared secret)
    GW->>Q: enqueue job (dispatch_queue_id, payload)
    GW-->>BE: 202 Accepted { dispatchQueueId }
    BE-->>FE: 200 { success:true, data: { status:"queued" } }
    FE->>FE: optimistic UI: render message bubble as "sending"

    Q->>GW: worker picks up job
    GW->>DB: mark message_dispatch_queue.status = processing
    GW->>WA: Baileys sendMessage()
    alt send succeeds
        WA-->>GW: ack
        GW->>DB: insert messages (status=sent), update dispatch_queue.status=sent
        GW->>SIO: emit message.created (status=sent)
    else send fails after retries
        GW->>DB: insert message_processing_failures, dispatch_queue.status=failed
        GW->>SIO: emit message.failed
    end
    SIO-->>FE: message.created / message.failed
    FE->>FE: replace optimistic bubble with confirmed state or error + retry action

    WA-->>GW: delivery receipt (async)
    GW->>DB: insert message_status_events(status=delivered), update messages.status
    GW->>SIO: emit message.updated
    WA-->>GW: read receipt (async)
    GW->>DB: insert message_status_events(status=read), update messages.status
    GW->>SIO: emit message.updated
    SIO-->>FE: message.updated (double-check marks)
```

## 3. QR Connection Lifecycle

Gateway boot → QR generated → scanned → authenticated → session persisted.

```mermaid
sequenceDiagram
    participant Admin as Admin (Frontend)
    participant BE as backend
    participant GW as whatsapp-gateway
    participant DB as MySQL
    participant SIO as Socket.IO (/gateway)
    participant WA as WhatsApp

    Admin->>BE: POST /api/v1/whatsapp/connection/start
    BE->>GW: POST /internal/gateway/session/start
    GW->>DB: load whatsapp_session_credentials (none found - fresh link)
    GW->>WA: init Baileys socket (multi-device)
    WA-->>GW: QR payload event
    GW->>DB: update whatsapp_sessions (status=qr_pending, qr_code, qr_expires_at)
    GW->>DB: insert whatsapp_connection_events (event_type=qr_generated)
    GW->>SIO: emit connection.updated (status=qr_pending, qrCode)
    SIO-->>Admin: connection.updated
    Admin->>Admin: render QR image in settings/whatsapp page

    Admin->>WA: scans QR with phone's WhatsApp app
    WA-->>GW: authentication success event (creds)
    GW->>DB: persist whatsapp_session_credentials (encrypted key/value rows)
    GW->>DB: update whatsapp_sessions (status=connected, phone_number, last_connected_at)
    GW->>DB: insert whatsapp_connection_events (event_type=connected)
    GW->>SIO: emit connection.updated (status=connected, phoneNumber)
    SIO-->>Admin: connection.updated
    Admin->>Admin: QR screen replaced with "Connected as +1..." status

    opt QR expires unscanned
        GW->>DB: update whatsapp_sessions (status=disconnected)
        GW->>SIO: emit connection.updated (status=disconnected, reason=qr_expired)
        Admin->>BE: POST /whatsapp/connection/start (retry)
    end
```

## 4. Lead Conversion Flow

Conversation/contact → lead → deal → pipeline stage.

```mermaid
flowchart TD
    A[Inbound WhatsApp conversation] --> B{Contact linked to CRM contact?}
    B -- No --> C[Agent merges whatsapp_contact -> contacts\nPOST /contacts/{id}/merge]
    B -- Yes --> D[Existing contacts row]
    C --> D
    D --> E[Agent creates Lead\nPOST /leads\n{contact_id, conversation_id, source: whatsapp}]
    E --> F[Lead status: new]
    F --> G[Manager/Agent qualifies\nPATCH /leads/{id} status=qualified]
    G --> H[Convert Lead to Deal\nPOST /leads/{id}/convert]
    H --> I[deals row created\nlead_id, contact_id, pipeline_id, pipeline_stage_id = first stage]
    H --> J[leads.status = converted]
    I --> K[deal_stage_history row inserted\nfrom_stage=null, to_stage=first stage]
    K --> L[Deal appears on kanban board]
    L --> M{Agent drags card to next stage}
    M --> N[PATCH /deals/{id}/stage]
    N --> O[deals.pipeline_stage_id updated]
    N --> P[deal_stage_history row inserted\nfrom_stage, to_stage, moved_by, moved_at]
    O --> Q{Stage is_won_stage or is_lost_stage?}
    Q -- won --> R[deals.status = won]
    Q -- lost --> S[deals.status = lost]
    Q -- neither --> L
```

## 5. Reconnection Flow

Session credential reload → reconnect attempt → backoff → connection event logged.

```mermaid
sequenceDiagram
    participant GW as whatsapp-gateway
    participant DB as MySQL
    participant WA as WhatsApp
    participant SIO as Socket.IO (/gateway)
    participant Alert as Admin notification path

    Note over GW: connection drops (network blip, WA-side restart, etc.)
    WA--xGW: socket closed / connection error
    GW->>DB: update whatsapp_sessions (status=disconnected, disconnect_reason)
    GW->>DB: insert whatsapp_connection_events (event_type=disconnected, metadata)
    GW->>SIO: emit connection.updated (status=disconnected)

    loop exponential backoff (e.g. 1s, 2s, 4s, 8s ... capped, max attempts)
        GW->>DB: insert whatsapp_connection_events (event_type=reconnect_attempt, attempt_n)
        GW->>DB: load whatsapp_session_credentials
        GW->>WA: attempt Baileys socket reconnect using persisted creds
        alt reconnect succeeds
            WA-->>GW: connected
            GW->>DB: update whatsapp_sessions (status=connected, last_connected_at)
            GW->>DB: insert whatsapp_connection_events (event_type=connected)
            GW->>SIO: emit connection.updated (status=connected)
            Note over GW: exit backoff loop
        else reconnect fails (transient)
            GW->>GW: increase backoff interval, retry
        else reconnect fails - logged_out (session invalidated by WhatsApp)
            GW->>DB: update whatsapp_sessions (status=logged_out)
            GW->>DB: insert whatsapp_connection_events (event_type=logged_out)
            GW->>SIO: emit connection.updated (status=logged_out)
            GW->>Alert: trigger workspace notification "WhatsApp disconnected - relink required"
            Note over GW: exit backoff loop, requires manual QR relink (Flow #3)
        end
    end
```
