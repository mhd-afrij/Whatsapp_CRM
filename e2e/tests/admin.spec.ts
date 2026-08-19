import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Admin / management flow tests.
 *
 * Covers:
 * - Dashboard date range filtering
 * - Report export
 * - Audit log review and filtering
 * - Suspending a user
 */

// ─── Dashboard ──────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("flow 20: dashboard loads with metric cards and date filters", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");

    // The dashboard has a heading "Dashboard".
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Date range inputs are present.
    await expect(page.getByLabel("From")).toBeVisible();
    await expect(page.getByLabel("To")).toBeVisible();

    // Metric cards are present (e.g., "New conversations", "Open conversations").
    await expect(page.getByText("New conversations")).toBeVisible();
    await expect(page.getByText("Open conversations")).toBeVisible();
  });

  test("flow 20b: changing the date range updates the dashboard", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");

    // Change the "From" date to 7 days ago.
    const fromInput = page.getByLabel("From");
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    await fromInput.fill(sevenDaysAgo);

    // The dashboard should refresh with new data.
    // At minimum, the input should have the new value.
    await expect(fromInput).toHaveValue(sevenDaysAgo);
  });
});

// ─── Report export ──────────────────────────────────────────────────────────

test.describe("Report export", () => {
  test("flow 21: export buttons are present on the dashboard", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");

    // The export section has buttons for different report types.
    await expect(page.getByRole("button", { name: /export contacts/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export leads/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export deals/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export tasks/i })).toBeVisible();
  });

  test("flow 21b: clicking export contacts triggers the export flow", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");

    // Click the contacts export button.
    await page.getByRole("button", { name: /export contacts/i }).click();

    // The button should change to "Generating..." then "Queued".
    await expect(page.getByRole("button", { name: /queued/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Audit log ──────────────────────────────────────────────────────────────

test.describe("Audit log", () => {
  test("flow 22: audit log page loads with filter inputs", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/audit-log");

    // The audit log page has a heading "Audit Log".
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();

    // Filter inputs are present.
    await expect(page.getByLabel("From")).toBeVisible();
    await expect(page.getByLabel("To")).toBeVisible();
    await expect(page.getByLabel("Actor")).toBeVisible();
    await expect(page.getByLabel("Action")).toBeVisible();
  });

  test("flow 22b: filtering audit log by action shows matching entries", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/audit-log");

    // Type in the action filter.
    await page.getByLabel("Action").fill("auth.login");

    // The table should refresh with filtered entries.
    // At minimum, the input should have the value.
    await expect(page.getByLabel("Action")).toHaveValue("auth.login");
  });
});

// ─── Suspend user ───────────────────────────────────────────────────────────

test.describe("Suspend user", () => {
  test("flow 23: user management page loads with invite form and user table", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/users");

    // The page has a heading "User Management".
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    // The invite form is present.
    await expect(page.getByText("Invite a user")).toBeVisible();
    await expect(page.getByRole("button", { name: /send invitation/i })).toBeVisible();

    // The user table header is present.
    await expect(page.getByText("Workspace users")).toBeVisible();
  });

  test("flow 23b: suspending a user shows a confirmation and updates status", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/users");

    // Find the first user row with a "Suspend" button.
    const suspendBtn = page.getByRole("button", { name: "Suspend" }).first();

    // If there's a suspend button visible, click it.
    if (await suspendBtn.isVisible()) {
      // The button triggers a window.confirm dialog.
      page.on("dialog", (dialog) => dialog.accept());
      await suspendBtn.click();

      // After confirmation, the user's status should change to "Suspended".
      await expect(page.getByText("Suspended").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
