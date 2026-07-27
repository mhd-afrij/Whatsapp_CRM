# Restructure Plan — WhatsApp CRM

## Overview

Migrate all three services (Frontend, Backend API, WhatsApp Sync) to match the specified directory structure and file conventions.

---

## Key Decision: TypeScript → JavaScript

The user's structure specifies `.jsx`/`.js` files. The current codebase uses TypeScript (`.tsx`/`.ts`). **This plan converts all TypeScript to JavaScript** (plain JSX/JS) to match the target structure. Type information from existing `.ts` files will be preserved as JSDoc where appropriate.

---

## Phase 1: Frontend Restructuring

### 1.1 Rename/Convert TypeScript → JavaScript

- Rename all `.tsx` → `.jsx`, all `.ts` → `.js`
- Remove TypeScript-specific syntax (type imports, generics, type annotations)
- Convert `tsconfig.json` → remove or keep for editor intellisense only

### 1.2 Create New Directory Structure

**Create these directories:**
```
src/
├── assets/images/
├── assets/icons/
├── assets/fonts/
├── components/common/        (Button, Input, Modal, Badge, Loader, EmptyState)
├── components/layout/        (Sidebar, Header, Footer, DashboardLayout)
├── components/chat/          (ChatList, ChatWindow, MessageBubble, MessageInput, AttachmentPreview)
├── components/contacts/
├── components/leads/
├── components/tasks/
├── components/reports/
├── components/users/
├── pages/auth/               (LoginPage, RegisterPage, ForgotPasswordPage)
├── pages/dashboard/          (DashboardPage)
├── pages/inbox/              (InboxPage)
├── pages/contacts/           (ContactListPage, ContactDetailsPage)
├── pages/leads/              (LeadListPage, LeadPipelinePage)
├── pages/tasks/              (TasksPage)
├── pages/team/               (UsersPage, RolesPage)
├── pages/reports/            (ReportsPage)
├── pages/settings/           (SettingsPage)
├── pages/whatsapp/           (WhatsAppConnectionPage)
├── features/auth/            (authApi.js, authSlice.js, authValidation.js)
├── features/inbox/
├── features/contacts/
├── features/leads/
├── features/tasks/
├── features/notifications/
├── features/users/
├── services/                 (apiClient, authService, chatService, contactService, leadService, taskService)
├── hooks/                    (useAuth, useSocket, usePermission, useDebounce)
├── context/                  (AuthContext, SocketContext)
├── routes/                   (AppRoutes, ProtectedRoute, RoleRoute)
├── store/slices/
├── utils/                    (constants, formatDate, permissions, validators)
├── config/                   (env, navigation)
├── styles/                   (index.css)
```

### 1.3 File Mapping

| Current File | New File |
|---|---|
| `src/main.tsx` | `src/main.jsx` |
| `src/App.tsx` | `src/App.jsx` (simplified, delegates to `routes/AppRoutes.jsx`) |
| `src/lib/api-client.ts` | `src/services/apiClient.js` |
| `src/lib/sync-client.ts` | `src/services/chatService.js` (sync parts) |
| `src/lib/socket-client.ts` | `src/hooks/useSocket.js` |
| `src/lib/api-error.js` | `src/utils/apiError.js` (or inline) |
| `src/lib/utils.ts` | `src/utils/formatDate.js` (cn utility) |
| `src/stores/auth-store.ts` | `src/store/authSlice.js` + `src/store/index.js` |
| `src/providers/QueryProvider.tsx` | `src/context/QueryContext.jsx` |
| `src/components/auth/AuthGuard.tsx` | `src/routes/ProtectedRoute.jsx` |
| `src/components/layout/AppShell.tsx` | `src/components/layout/DashboardLayout.jsx` |
| `src/components/layout/Sidebar.tsx` | `src/components/layout/Sidebar.jsx` |
| `src/components/layout/TopHeader.tsx` | `src/components/layout/Header.jsx` |
| `src/components/layout/UserMenu.tsx` | merged into `Header.jsx` |
| `src/components/layout/MobileNavigation.tsx` | `src/components/layout/Footer.jsx` |
| `src/components/ui/StatusBadge.tsx` | `src/components/common/Badge.jsx` |
| `src/components/ui/PageHeader.tsx` | merged into page components |
| `src/components/ui/EmptyState.tsx` | `src/components/common/EmptyState.jsx` |
| `src/app/(auth)/login/page.tsx` | `src/pages/auth/LoginPage.jsx` |
| `src/app/(workspace)/dashboard/page.tsx` | `src/pages/dashboard/DashboardPage.jsx` |
| `src/app/(workspace)/inbox/page.tsx` | `src/pages/inbox/InboxPage.jsx` |
| `src/app/(workspace)/team/page.tsx` | `src/pages/team/UsersPage.jsx` |
| `src/app/(workspace)/audit-log/page.tsx` | `src/pages/team/AuditLogPage.jsx` (or separate) |
| `src/app/(workspace)/settings/roles/page.tsx` | `src/pages/team/RolesPage.jsx` |
| `src/app/(workspace)/settings/whatsapp/page.tsx` | `src/pages/whatsapp/WhatsAppConnectionPage.jsx` |
| `src/app/(workspace)/settings/page.tsx` | `src/pages/settings/SettingsPage.jsx` |
| `src/app/(workspace)/analytics/page.tsx` | `src/pages/reports/ReportsPage.jsx` |
| `src/app/(workspace)/notifications/page.tsx` | `src/pages/dashboard/NotificationsPage.jsx` |
| `src/types/auth.ts` | types as JSDoc in relevant files |
| `src/types/inbox.ts` | types as JSDoc in relevant files |
| `src/types/admin.ts` | types as JSDoc in relevant files |
| `src/app/globals.css` | `src/styles/index.css` |

### 1.4 New Files to Create

- `src/services/authService.js` — extracted auth API calls
- `src/services/contactService.js` — CRM customer API calls
- `src/services/leadService.js` — CRM lead API calls
- `src/services/taskService.js` — CRM task API calls
- `src/hooks/useAuth.js` — auth convenience hook
- `src/hooks/usePermission.js` — permission check hook
- `src/hooks/useDebounce.js` — debounce hook
- `src/context/AuthContext.jsx` — wraps Zustand store
- `src/context/SocketContext.jsx` — provides socket instance
- `src/routes/AppRoutes.jsx` — all route definitions
- `src/routes/RoleRoute.jsx` — role-based route guard
- `src/store/index.js` — store exports
- `src/store/slices/` — feature slices
- `src/config/env.js` — environment config
- `src/config/navigation.js` — sidebar navigation items
- `src/utils/constants.js` — app constants
- `src/utils/validators.js` — validation helpers

### 1.5 Config Files

- Keep `vite.config.js` (rename from `.ts`)
- Create `tailwind.config.js` (if needed, or keep Tailwind v4 CSS-based)
- Keep `eslint.config.js`

---

## Phase 2: Backend API Restructuring

### 2.1 Flatten Controller Namespace

**Move:** `app/Http/Controllers/Api/V1/` → `app/Http/Controllers/Api/`
- `AuthController.php` stays
- `DashboardController.php` stays
- `ConversationController.php` stays
- Split `CrmController.php` into:
  - `ContactController.php` (customers CRUD)
  - `LeadController.php` (leads CRUD)
  - `TaskController.php` (tasks + calendar CRUD)
- `UserController.php` stays
- `RoleController.php` stays
- Add `ReportController.php` (placeholder or extract from DashboardController)
- `WhatsAppWebhookController.php` → `WhatsAppController.php`
- `HealthController.php` stays
- Rename `EnsurePermission` → `CheckPermission`
- Rename `EnsureInternalSecret` → keep or rename

### 2.2 Create Missing Files

**Repositories:**
- `app/Repositories/ContactRepository.php`
- `app/Repositories/ConversationRepository.php`
- `app/Repositories/LeadRepository.php`
- `app/Repositories/TaskRepository.php`

**Events:**
- `app/Events/MessageReceived.php`
- `app/Events/ConversationAssigned.php`
- `app/Events/NotificationCreated.php`

**Jobs:**
- `app/Jobs/ProcessIncomingMessage.php`
- `app/Jobs/SendWhatsAppMessage.php`
- `app/Jobs/SyncWhatsAppContacts.php`
- `app/Jobs/GenerateReport.php`

**Policies:**
- `app/Policies/ConversationPolicy.php`
- `app/Policies/LeadPolicy.php`
- `app/Policies/UserPolicy.php`

**Missing Models:**
- `app/Models/Contact.php` (rename from Customer.php or add alias)
- `app/Models/PipelineStage.php`
- `app/Models/Note.php`
- `app/Models/Notification.php`
- `app/Models/Attachment.php`
- Rename `WhatsAppAccount.php` → `WhatsAppSession.php`

**Traits:**
- `app/Traits/ApiResponse.php` (create — standard JSON response helpers)
- `app/Traits/Auditable.php` (create — wraps AuditLogger)

**Middleware:**
- Rename `EnsurePermission.php` → `CheckPermission.php`
- Rename `EnsureInternalSecret.php` → keep or create proper name
- Add `Authenticate.php` (if using Laravel's default, or wrap)

**Form Requests:**
- Add `app/Http/Requests/Contact/` (CreateContactRequest, UpdateContactRequest)
- Add `app/Http/Requests/Lead/` (CreateLeadRequest, UpdateLeadRequest)
- Add `app/Http/Requests/Message/` (SendMessageRequest)
- Add `app/Http/Requests/Task/` (CreateTaskRequest, UpdateTaskRequest)
- Add `app/Http/Requests/User/` (CreateUserRequest, UpdateUserRequest)

**Resources:**
- Add `ContactResource.php`
- Add `LeadResource.php`
- Add `MessageResource.php`
- Add `ConversationResource.php`

### 2.3 Split Route Files

| Current | New |
|---|---|
| `routes/api.php` (everything) | `routes/api.php` (CRM + conversations + dashboard) |
| — | `routes/auth.php` (auth routes) |
| — | `routes/admin.php` (roles, users, audit-logs) |
| — | `routes/webhooks.php` (internal WhatsApp webhooks) |

### 2.4 Move Models

- `Customer.php` → `Contact.php` (rename model + table alias)
- `WhatsAppAccount.php` → `WhatsAppSession.php`
- Add `PipelineStage.php`, `Note.php`, `Notification.php`, `Attachment.php`

### 2.5 Console Commands

Create `app/Console/Commands/` directory (even if empty for now).

---

## Phase 3: WhatsApp Sync Service Restructuring

### 3.1 Convert TypeScript → JavaScript

- Rename all `.ts` → `.js`
- Remove TypeScript syntax
- Update `tsconfig.json` or remove it

### 3.2 Extract from Monolithic `server.ts`

The current `server.ts` (~600 lines) contains everything. Split into:

**Config:**
- `src/config/env.js` (exists, just rename)
- `src/config/logger.js` (move from `src/observability/logger.ts`)
- `src/config/redis.js` (new — Redis connection config)

**Controllers:**
- `src/controllers/connectionController.js` — QR, connect, unlink, heartbeat
- `src/controllers/messageController.js` — send message
- `src/controllers/sessionController.js` — session status

**Services:**
- `src/services/baileysService.js` (rename from `whatsapp-adapter.ts`)
- `src/services/messageService.js` (new — message formatting/storage)
- `src/services/mediaService.js` (new — media download/upload)
- `src/services/sessionService.js` (new — session persistence logic)
- `src/services/webhookService.js` (new — Laravel webhook calls)

**Handlers:**
- `src/handlers/connectionHandler.js` (new — Baileys connection events)
- `src/handlers/messageHandler.js` (new — Baileys message events)
- `src/handlers/contactHandler.js` (new — contact sync events)
- `src/handlers/groupHandler.js` (new — group events)

**Routes:**
- `src/routes/connectionRoutes.js` — `/internal/v1/session/*`
- `src/routes/messageRoutes.js` — `/internal/v1/messages/*`
- `src/routes/sessionRoutes.js` — health/ready

**Sockets:**
- `src/sockets/socketServer.js` (new — Socket.io setup + event handlers)

**Queues (using BullMQ):**
- `src/queues/messageQueue.js`
- `src/queues/mediaQueue.js`
- `src/queues/retryQueue.js`

**Workers:**
- `src/workers/messageWorker.js`
- `src/workers/mediaWorker.js`

**Utils:**
- `src/utils/jidFormatter.js` (new — JID formatting helpers)
- `src/utils/messageParser.js` (new — message extraction)
- `src/utils/retryHelper.js` (new — retry logic)

**Entry Points:**
- `src/app.js` (new — Express app setup, middleware, routes mounting)
- `src/server.js` (new — HTTP server creation, Socket.io, start listening)
- `src/index.js` (rename from `index.ts`)

### 3.3 Config Files

- Create `nodemon.json` for dev
- Update `package.json` scripts

---

## Execution Order

1. **Phase 3: WhatsApp Sync** (smallest, most self-contained)
2. **Phase 2: Backend API** (PHP changes, no build system concerns)
3. **Phase 1: Frontend** (largest, most files, TypeScript→JavaScript conversion)

---

## Verification

After each phase:
- Run lint/typecheck commands
- Verify no import/require errors
- Confirm the application starts correctly

Phase 1 verification: `npm run build` in Frontend/
Phase 2 verification: `php artisan test` in Backend/api/
Phase 3 verification: `npm run typecheck && npm run build` in Backend/whatsapp-sync/
