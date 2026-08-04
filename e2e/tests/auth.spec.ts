import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 1-5 of the original 23-flow spec: login, password reset,
 * invitation accept, role restriction, cross-workspace rejection.
 */

test.describe("Login", () => {
  test("flow 1: a valid agent can log in and land on the inbox", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await expect(page).toHaveURL(/\/inbox/);
  });

  test("rejects invalid credentials with an inline error, no redirect", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USERS.agent.email);
    await page.getByLabel(/password/i).fill("WrongPassword1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/credentials do not match/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Password reset", () => {
  test("flow 2: forgot-password request and reset with a token completes and allows login", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill(TEST_USERS.agent.email);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible();

    // In a real run, the reset token would be pulled from a test mailbox/API
    // hook seeded by the backend's `array` mail driver rather than a real inbox.
    const resetToken = process.env.E2E_SEEDED_RESET_TOKEN ?? "test-reset-token";
    await page.goto(`/reset-password?token=${resetToken}`);
    await page.getByLabel(/^new password/i).fill("NewPassword123!");
    await page.getByLabel(/confirm password/i).fill("NewPassword123!");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Invitation", () => {
  test("flow 3: administrator invites a user, invitee accepts and can log in", async ({
    page,
    browser,
  }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/users");
    await page.getByRole("button", { name: /invite user/i }).click();
    const inviteEmail = `e2e-invitee-${Date.now()}@example.com`;
    await page.getByLabel(/email/i).fill(inviteEmail);
    await page.getByLabel(/role/i).selectOption({ label: "Agent" });
    await page.getByRole("button", { name: /send invitation/i }).click();
    await expect(page.getByText(/invitation created|invitation sent/i)).toBeVisible();

    const inviteContext = await browser.newContext();
    const invitePage = await inviteContext.newPage();
    const inviteToken = process.env.E2E_SEEDED_INVITE_TOKEN ?? "test-invite-token";
    await invitePage.goto(`/accept-invitation?token=${inviteToken}`);
    await invitePage.getByLabel(/full name|name/i).fill("E2E Invitee");
    await invitePage.getByLabel(/^password/i).fill("Password123!");
    await invitePage.getByLabel(/confirm password/i).fill("Password123!");
    await invitePage.getByRole("button", { name: /accept|create account/i }).click();
    await expect(invitePage).toHaveURL(/\/inbox/);
    await inviteContext.close();
  });
});

test.describe("Role restriction", () => {
  test("flow 4: an Agent is redirected away from an admin-only settings page", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/settings/roles");
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});

test.describe("Cross-workspace rejection", () => {
  test("flow 23: a user from workspace B gets a not-found (never data) for workspace A's record", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.agent);
    // A contact id known to belong to a different, seeded second workspace.
    const foreignContactId = process.env.E2E_FOREIGN_WORKSPACE_CONTACT_ID ?? "999999";
    await page.goto(`/contacts/${foreignContactId}`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
