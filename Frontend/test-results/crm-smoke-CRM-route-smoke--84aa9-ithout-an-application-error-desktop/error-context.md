# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crm-smoke.spec.ts >> CRM route smoke checks >> loads core CRM routes without an application error
- Location: e2e\crm-smoke.spec.ts:26:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /inbox/i }).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: /inbox/i }).first()
  - Test timeout of 30000ms exceeded.

```

```yaml
- complementary:
  - text: CRM WhatsApp
  - navigation:
    - button "Workspace 7" [expanded]
    - link "Dashboard":
      - /url: /dashboard
    - link "Inbox":
      - /url: /inbox
    - link "Contacts":
      - /url: /contacts
    - link "Leads":
      - /url: /leads
    - link "Tasks":
      - /url: /tasks
    - link "Calendar":
      - /url: /calendar
    - link "Notifications":
      - /url: /settings/notifications
    - button "Management 3"
    - link "User Management":
      - /url: /settings/users
    - link "Teams":
      - /url: /settings/teams
    - link "Roles & Permissions":
      - /url: /settings/roles
    - button "Administration 9"
    - link "Settings":
      - /url: /settings
    - link "WhatsApp Connection":
      - /url: /settings/whatsapp
    - link "Labels":
      - /url: /settings/labels
    - link "SLA Configuration":
      - /url: /settings/sla
    - link "Workspace Settings":
      - /url: /settings/workspace
    - link "Audit Log":
      - /url: /settings/audit-log
    - link "WhatsApp Health":
      - /url: /settings/whatsapp-health
    - link "Custom Fields":
      - /url: /settings/custom-fields
    - link "Duplicate Contacts":
      - /url: /settings/contacts
- main:
  - paragraph: WhatsApp Inbox
  - text: No active connection
  - button "Reconnect WhatsApp"
  - button "WhatsApp settings"
  - button "New Chat"
  - text: idle
  - textbox "Search conversations"
  - button "All"
  - button "Mine"
  - button "Unassigned"
  - button "Unread"
  - button "Waiting"
  - button "SLA Risk"
  - button "SLA Breached"
  - button "Archived"
  - button "Filters"
  - paragraph: Select a conversation
  - paragraph: Choose a conversation from the list on the left to view and reply to messages.
- alert
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | 
  3  | const email = process.env.E2E_EMAIL ?? "e2e-admin@example.com";
  4  | const password = process.env.E2E_PASSWORD ?? "Password123!";
  5  | 
  6  | async function login(page: Page) {
  7  |   await page.goto("/login");
  8  |   await page.getByLabel("Email").fill(email);
  9  |   await page.getByRole("textbox", { name: "Password" }).fill(password);
  10 |   await page.getByRole("button", { name: /sign in/i }).click();
  11 |   await expect(page).toHaveURL(/\/inbox/, { timeout: 15_000 });
  12 | }
  13 | 
  14 | test.describe("CRM route smoke checks", () => {
  15 |   test("authenticates and renders the dashboard overview", async ({ page }) => {
  16 |     await login(page);
  17 |     await page.goto("/dashboard");
  18 |     await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
  19 |     await expect(page.getByText("Pipeline performance")).toBeVisible();
  20 |     await expect(page.getByText("WhatsApp status")).toBeVisible();
  21 |     await expect(page.getByText("Lead pipeline")).toBeVisible();
  22 |     await expect(page.getByText("Quick actions")).toBeVisible();
  23 |     await expect(page.locator("body")).not.toContainText("Application error");
  24 |   });
  25 | 
  26 |   test("loads core CRM routes without an application error", async ({ page }) => {
  27 |     await login(page);
  28 |     const routes = [
  29 |       ["/inbox", /inbox/i],
  30 |       ["/contacts", /contacts/i],
  31 |       ["/leads", /lead pipeline/i],
  32 |       ["/tasks", /tasks/i],
  33 |       ["/settings", /settings/i],
  34 |     ] as const;
  35 | 
  36 |     for (const [route, heading] of routes) {
  37 |       await page.goto(route);
  38 |       await expect(page.locator("body")).not.toContainText("Application error");
> 39 |       await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 15_000 });
     |                                                                          ^ Error: expect(locator).toBeVisible() failed
  40 |     }
  41 |   });
  42 | 
  43 |   test("opens the contact detail drawer when a contact is available", async ({ page }) => {
  44 |     await login(page);
  45 |     await page.goto("/contacts");
  46 |     const contactButton = page.locator("tbody button").first();
  47 |     if (await contactButton.count()) {
  48 |       await contactButton.click();
  49 |       await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
  50 |       await expect(page.getByText("Profile")).toBeVisible();
  51 |     }
  52 |   });
  53 | 
  54 |   test("keeps dashboard content usable on a mobile viewport", async ({ page }) => {
  55 |     await login(page);
  56 |     await page.goto("/dashboard");
  57 |     await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
  58 |     await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  59 |   });
  60 | });
  61 | 
```