# 06 — Frontend Route Map (Next.js 14 App Router)

## 1. Route Tree

```
app/
├── layout.tsx                          # root layout: fonts, theme, TanStack Query provider
├── globals.css                         # Tailwind base + design tokens
├── (auth)/
│   ├── layout.tsx                      # centered auth shell, no sidebar
│   ├── login/page.tsx                  # POST /api/v1/auth/login
│   ├── forgot-password/page.tsx
│   ├── reset-password/[token]/page.tsx
│   └── invitations/[token]/page.tsx    # accept invite, set password
│
├── (dashboard)/
│   ├── layout.tsx                      # authenticated shell: top bar + left nav + socket providers
│   ├── page.tsx                        # redirects to /dashboard/overview or /inbox
│   │
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   └── overview/page.tsx           # Recharts KPI dashboard (GET /dashboard/*)
│   │
│   ├── inbox/
│   │   ├── layout.tsx                  # 3-panel shell (see §2)
│   │   ├── page.tsx                    # empty-state / first conversation redirect
│   │   └── [conversationId]/page.tsx   # populates center + right panel
│   │
│   ├── contacts/
│   │   ├── page.tsx                    # list + filters (GET /contacts)
│   │   ├── [contactId]/page.tsx        # detail + activity timeline
│   │   └── new/page.tsx                # manual create form
│   │
│   ├── leads/
│   │   ├── page.tsx                    # list view
│   │   └── [leadId]/page.tsx           # detail, convert-to-deal action
│   │
│   ├── deals/
│   │   ├── page.tsx                    # pipeline switcher + kanban board
│   │   ├── [pipelineId]/page.tsx       # kanban for a specific pipeline
│   │   └── [pipelineId]/deals/[dealId]/page.tsx  # deal detail drawer/page
│   │
│   ├── pipelines/
│   │   └── page.tsx                    # admin: manage pipelines/stages
│   │
│   ├── tasks/
│   │   ├── page.tsx                    # list/board view
│   │   └── calendar/page.tsx           # calendar aggregation view
│   │
│   ├── search/
│   │   └── page.tsx                    # global search results (?q=)
│   │
│   ├── notifications/
│   │   └── page.tsx                    # full notification center (also in top-bar dropdown)
│   │
│   ├── settings/
│   │   ├── layout.tsx                  # settings sub-nav
│   │   ├── workspace/page.tsx          # workspace profile, branding, business hours
│   │   ├── whatsapp/page.tsx           # QR linking, connection status, reconnect/logout
│   │   ├── users/page.tsx              # user admin list
│   │   ├── users/invitations/page.tsx  # pending invitations
│   │   ├── roles/page.tsx              # role/permission matrix editor
│   │   ├── teams/page.tsx              # team admin
│   │   ├── labels/page.tsx             # label management
│   │   └── audit-logs/page.tsx         # audit log viewer
│   │
│   └── profile/
│       └── page.tsx                    # current user's own profile + notification prefs
│
├── api/                                 # Next.js route handlers (thin — mostly proxy/BFF concerns)
│   └── auth/[...nextauth]/ (or custom session bridge, if used)
│
└── not-found.tsx
```

## 2. Inbox 3-Panel Layout Notes

`app/(dashboard)/inbox/layout.tsx` renders a CSS grid:

```
grid-template-columns: 320px minmax(0,1fr) 360px;
```

| Panel | Component | Data Source |
|---|---|---|
| Left — conversation list | `ConversationListPanel` | TanStack Query on `GET /conversations`, live-patched by `conversation.created` / `conversation.updated` / `conversation.assigned` socket events |
| Center — active chat | `ChatPanel` | `GET /conversations/{id}/messages` (cursor pagination, infinite scroll upward), live-patched by `message.created` / `message.updated` / `message.failed`, composer posts `POST /conversations/{id}/messages` |
| Right — contact/deal context | `ContactContextPanel` | `GET /contacts/{id}`, associated leads/deals/tasks/notes; internal notes tab posts to `POST /notes` |

Responsive behavior: below `lg` breakpoint, the layout collapses to a single-panel navigable
stack (list → chat → context) using a mobile nav pattern; the right panel becomes a slide-over
sheet (shadcn `Sheet`).

Realtime wiring: a `SocketProvider` in `(dashboard)/layout.tsx` opens two Socket.IO client
connections on mount (or one multiplexed client with two namespaces — `/crm` and `/gateway`)
scoped to `workspace:{workspaceId}` room, joined right after `auth/me` resolves. See
`EVENT_CATALOG.md`.

## 3. State/Data Layer Conventions

- Every list page uses a TanStack Query `useInfiniteQuery` or `useQuery` keyed by
  `[entity, filters]`; socket events call `queryClient.setQueryData`/`invalidateQueries` for the
  matching key rather than full refetch where possible.
- Every mutation form uses `react-hook-form` + a Zod schema colocated in
  `lib/validation/{entity}.ts`, mirroring backend Form Request rules 1:1.
- Route-level `loading.tsx` and `error.tsx` per major segment (`inbox`, `contacts`, `deals`,
  `tasks`) for streaming/suspense boundaries.

## 4. Access Control at Route Level

`(dashboard)/layout.tsx` reads the current user's permission set (`GET /auth/me`) and:
- Hides nav entries the user lacks permission for.
- Renders a 403 state (not a redirect loop) if a user deep-links into a route they lack
  permission for, using the same permission matrix as the backend (`07-permission-matrix.md`)
  so behavior stays in sync — the source of truth is always the backend's `errors.code === "FORBIDDEN"` response; the frontend check is a UX optimization, not the security boundary.
