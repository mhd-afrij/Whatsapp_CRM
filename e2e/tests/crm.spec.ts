import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 14-17: convert-to-lead, create deal, move pipeline stage
 * (drag), mark deal won.
 */

test.describe("Lead conversion", () => {
  test("flow 14: converting a contact to a lead creates a lead visible in /leads", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/contacts");
    await page.getByText(/e2e test contact/i).first().click();
    await page.getByRole("button", { name: /convert to lead/i }).click();
    await expect(page.getByText(/converted to lead/i)).toBeVisible();

    await page.goto("/leads");
    await expect(page.getByText(/e2e test contact/i)).toBeVisible();
  });
});

test.describe("Deal creation and pipeline movement", () => {
  test("flow 15: creating a deal against a contact places it in the pipeline board", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/pipeline");
    await page.getByRole("button", { name: /new deal/i }).click();
    await page.getByLabel(/contact/i).fill("E2E Test Contact");
    await page.getByRole("option", { name: /e2e test contact/i }).click();
    await page.getByLabel(/title/i).fill("E2E Test Deal");
    await page.getByLabel(/value/i).fill("1500");
    await page.getByRole("button", { name: /create deal/i }).click();
    await expect(page.getByText("E2E Test Deal")).toBeVisible();
  });

  test("flow 16: dragging a deal card to the next pipeline column moves its stage", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/pipeline");
    const card = page.getByText("E2E Test Deal").first();
    const targetColumn = page.getByTestId("pipeline-column-negotiation");
    await card.dragTo(targetColumn);
    await expect(targetColumn.getByText("E2E Test Deal")).toBeVisible();
  });

  test("flow 17: marking a deal won updates its status and closes it", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/pipeline");
    await page.getByText("E2E Test Deal").first().click();
    await page.getByRole("button", { name: /mark won/i }).click();
    await expect(page.getByText(/status: won/i)).toBeVisible();
  });
});
