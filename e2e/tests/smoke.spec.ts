import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Route smoke checks (consolidated from the former frontend/e2e
 * crm-smoke.spec.ts so there is a single Playwright setup in the repo).
 *
 * Covers:
 * - Dashboard overview renders its core widgets
 * - Core CRM routes load without an application error
 * - Contact detail drawer opens from the contacts table
 * - Dashboard stays usable on a mobile viewport
 */

test.describe("CRM route smoke checks", () => {
  test("authenticates and renders the dashboard overview", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
    await expect(page.getByText("Pipeline performance")).toBeVisible();
    await expect(page.getByText("WhatsApp status")).toBeVisible();
    await expect(page.getByText("Lead pipeline")).toBeVisible();
    await expect(page.getByText("Quick actions")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("loads core CRM routes without an application error", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    const routes = [
      ["/inbox", /inbox/i],
      ["/contacts", /contacts/i],
      ["/leads", /lead pipeline/i],
      ["/tasks", /tasks/i],
      ["/settings", /settings/i],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("opens the contact detail drawer when a contact is available", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/contacts");
    const contactButton = page.locator("tbody button").first();
    if (await contactButton.count()) {
      await contactButton.click();
      await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
      await expect(page.getByText("Profile")).toBeVisible();
    }
  });

  test("keeps dashboard content usable on a mobile viewport", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });
});
