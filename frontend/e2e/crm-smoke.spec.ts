import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "e2e-admin@example.com";
const password = process.env.E2E_PASSWORD ?? "Password123!";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/inbox/, { timeout: 15_000 });
}

test.describe("CRM route smoke checks", () => {
  test("authenticates and renders the dashboard overview", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
    await expect(page.getByText("Pipeline performance")).toBeVisible();
    await expect(page.getByText("WhatsApp status")).toBeVisible();
    await expect(page.getByText("Lead pipeline")).toBeVisible();
    await expect(page.getByText("Quick actions")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("loads core CRM routes without an application error", async ({ page }) => {
    await login(page);
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
    await login(page);
    await page.goto("/contacts");
    const contactButton = page.locator("tbody button").first();
    if (await contactButton.count()) {
      await contactButton.click();
      await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
      await expect(page.getByText("Profile")).toBeVisible();
    }
  });

  test("keeps dashboard content usable on a mobile viewport", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /here.s the pulse/i })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });
});
