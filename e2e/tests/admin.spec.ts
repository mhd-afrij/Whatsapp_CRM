import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 20-23: dashboard filter, export report, audit log review,
 * suspend user.
 */

test.describe("Dashboard", () => {
  test("flow 20: changing the dashboard date range filter updates the summary numbers", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");
    const wonBefore = await page.getByTestId("stat-deals-won-value").textContent();
    await page.getByLabel(/date range/i).selectOption({ label: "Last 7 days" });
    await expect(page.getByTestId("stat-deals-won-value")).not.toHaveText(wonBefore ?? "");
  });
});

test.describe("Report export", () => {
  test("flow 21: exporting a contacts report queues it and a download notification appears", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /export report/i }).click();
    await page.getByRole("option", { name: /contacts/i }).click();
    await page.getByRole("button", { name: /queue export/i }).click();
    await expect(page.getByText(/export queued/i)).toBeVisible();

    await page.getByRole("button", { name: /notifications/i }).click();
    const downloadLink = page.getByRole("link", { name: /download/i });
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Audit log", () => {
  test("flow 22: an administrator reviews the audit log and filters by action", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/audit-log");
    await page.getByLabel(/action/i).selectOption({ label: "auth.login" });
    await expect(page.getByText(/auth\.login/i).first()).toBeVisible();
  });
});

test.describe("Suspend user", () => {
  test("flow 23b: suspending a user immediately blocks their next login", async ({ page, browser }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/users");
    await page.getByText(/e2e agent/i).first().click();
    await page.getByRole("button", { name: /suspend/i }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByText(/suspended/i)).toBeVisible();

    const suspendedContext = await browser.newContext();
    const suspendedPage = await suspendedContext.newPage();
    await suspendedPage.goto("/login");
    await suspendedPage.getByLabel(/email/i).fill(TEST_USERS.agent.email);
    await suspendedPage.getByLabel(/password/i).fill(TEST_USERS.agent.password);
    await suspendedPage.getByRole("button", { name: /sign in/i }).click();
    await expect(suspendedPage.getByText(/suspended/i)).toBeVisible();
    await suspendedContext.close();
  });
});
