import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Authentication flow tests.
 *
 * Covers:
 * - Login (valid + invalid credentials)
 * - Password reset request and token-based reset
 * - Invitation acceptance
 * - Role restriction (Agent blocked from admin page)
 * - Cross-workspace rejection
 */

// ─── Login ──────────────────────────────────────────────────────────────────

test.describe("Login", () => {
  test("flow 1: a valid agent can log in and land on the inbox", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await expect(page).toHaveURL(/\/inbox/);
  });

  test("rejects invalid credentials with an inline error, no redirect", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_USERS.agent.email);
    await page.locator("#password").fill("WrongPassword1");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The login page shows a formError div with the API error message.
    // The exact text depends on the backend, but it should be a danger-styled message.
    await expect(page.locator(".text-danger, [class*='danger']").first()).toBeVisible();
    // Should stay on /login
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Password reset ─────────────────────────────────────────────────────────

test.describe("Password reset", () => {
  test("flow 2a: forgot-password request shows confirmation", async ({ page }) => {
    await page.goto("/forgot-password");

    // The form has id="email" and a "Send reset link" button.
    await page.locator("#email").fill(TEST_USERS.agent.email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    // After success, the page shows a green confirmation message.
    await expect(
      page.getByText(/password reset link has been sent/i)
    ).toBeVisible();
  });

  test("flow 2b: reset password with a token completes and redirects to login", async ({ page }) => {
    // In a real run, the reset token would be pulled from a test mailbox/API
    // hook seeded by the backend's `array` mail driver.
    const resetToken = process.env.E2E_SEEDED_RESET_TOKEN ?? "test-reset-token";
    await page.goto(`/reset-password?token=${resetToken}`);

    // The reset form has id="email", id="password", id="password_confirmation"
    // and a "Reset password" button.
    await page.locator("#email").fill(TEST_USERS.agent.email);
    await page.locator("#password").fill("NewPassword123!");
    await page.locator("#password_confirmation").fill("NewPassword123!");
    await page.getByRole("button", { name: "Reset password" }).click();

    // Should redirect to /login after success.
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Invitation ─────────────────────────────────────────────────────────────

test.describe("Invitation", () => {
  test("flow 3: administrator invites a user, invitee accepts and can log in", async ({
    page,
    browser,
  }) => {
    // Admin invites a new user from the users management page.
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/users");

    // The invite form has an email input (placeholder "name@example.com"),
    // a role select, and a "Send invitation" button.
    const inviteEmail = `e2e-invitee-${Date.now()}@example.com`;
    await page.locator('input[placeholder="name@example.com"]').fill(inviteEmail);

    // Select "Agent" from the role dropdown.
    await page.locator("select").first().selectOption({ label: "Agent" });

    await page.getByRole("button", { name: "Send invitation" }).click();

    // Success message appears.
    await expect(page.getByText(/invitation sent/i)).toBeVisible();

    // Now simulate the invitee accepting the invitation in a new context.
    const inviteContext = await browser.newContext();
    const invitePage = await inviteContext.newPage();
    const inviteToken = process.env.E2E_SEEDED_INVITE_TOKEN ?? "test-invite-token";
    await invitePage.goto(`/accept-invitation?token=${inviteToken}`);

    // The accept-invitation form has id="name", id="password", id="password_confirmation"
    // and an "Accept invitation" button.
    await invitePage.locator("#name").fill("E2E Invitee");
    await invitePage.locator("#password").fill("Password123!");
    await invitePage.locator("#password_confirmation").fill("Password123!");
    await invitePage.getByRole("button", { name: "Accept invitation" }).click();

    // After accepting, should redirect to /dashboard (see accept-invitation page.tsx).
    await expect(invitePage).toHaveURL(/\/dashboard/);
    await inviteContext.close();
  });
});

// ─── Role restriction ───────────────────────────────────────────────────────

test.describe("Role restriction", () => {
  test("flow 4: an Agent is redirected to unauthorized for admin-only pages", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/settings/roles");

    // The unauthorized page shows "Access denied" heading.
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
  });
});

// ─── Cross-workspace rejection ──────────────────────────────────────────────

test.describe("Cross-workspace rejection", () => {
  test("flow 5: a user from workspace B gets not-found for workspace A's record", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.agent);

    // A contact id known to belong to a different, seeded second workspace.
    const foreignContactId = process.env.E2E_FOREIGN_WORKSPACE_CONTACT_ID ?? "999999";
    await page.goto(`/contacts/${foreignContactId}`);

    // Should see a not-found or error state.
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });
});
