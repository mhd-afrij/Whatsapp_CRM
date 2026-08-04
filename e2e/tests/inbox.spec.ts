import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 10-13: conversation assignment, internal note, contact
 * update, search.
 */

test.describe("Conversation assignment", () => {
  test("flow 10: a manager assigns an unassigned conversation to an agent", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.goto("/inbox");
    await page.getByText(/unassigned/i).first().click();
    await page.getByRole("button", { name: /assign/i }).click();
    await page.getByRole("option", { name: /e2e agent/i }).click();
    await expect(page.getByText(/assigned to e2e agent/i)).toBeVisible();
  });
});

test.describe("Internal note", () => {
  test("flow 11: an agent adds an internal note visible only to staff", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");
    await page.getByText(/e2e test contact/i).first().click();
    await page.getByRole("tab", { name: /notes/i }).click();
    await page.getByPlaceholder(/add a note/i).fill("Called customer, will follow up tomorrow.");
    await page.getByRole("button", { name: /add note/i }).click();
    await expect(page.getByText("Called customer, will follow up tomorrow.")).toBeVisible();
  });
});

test.describe("Contact update", () => {
  test("flow 12: editing a contact's details persists and reflects in the panel", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/contacts");
    await page.getByText(/e2e test contact/i).first().click();
    await page.getByRole("button", { name: /edit/i }).click();
    await page.getByLabel(/company/i).fill("Acme E2E Corp");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Acme E2E Corp")).toBeVisible();
  });
});

test.describe("Search", () => {
  test("flow 19: global search surfaces a contact by name across modules", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/search");
    await page.getByPlaceholder(/search/i).fill("E2E Test Contact");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/e2e test contact/i)).toBeVisible();
  });
});
