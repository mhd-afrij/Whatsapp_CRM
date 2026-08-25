# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crm-smoke.spec.ts >> CRM route smoke checks >> loads core CRM routes without an application error
- Location: e2e\crm-smoke.spec.ts:26:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/inbox/
Received string:  "http://localhost:3000/login"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    33 × locator resolved to <html lang="en" class="geist_a71539c9-module__T19VSG__variable geist_mono_8d43a2aa-module__8Li5zG__variable h-full antialiased light">…</html>
       - unexpected value "http://localhost:3000/login"

```

```yaml
- heading "Sign in" [level=1]
- paragraph: Access your WhatsApp CRM workspace
- text: Email
- textbox "Email": e2e-admin@example.com
- text: Password
- textbox "Password": Password123!
- button "Show password"
- paragraph: Too Many Attempts.
- button "Sign in"
- paragraph:
  - link "Forgot your password?":
    - /url: /forgot-password
- paragraph:
  - text: Don't have an account?
  - link "Sign up":
    - /url: /signup
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
> 11 |   await expect(page).toHaveURL(/\/inbox/, { timeout: 15_000 });
     |                      ^ Error: expect(page).toHaveURL(expected) failed
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
  39 |       await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 15_000 });
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