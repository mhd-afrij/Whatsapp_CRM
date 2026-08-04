import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 18-19: create task, task reminder notification.
 */

test.describe("Tasks", () => {
  test("flow 18: creating a task with a due date shows it on /tasks", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/tasks");
    await page.getByRole("button", { name: /new task/i }).click();
    await page.getByLabel(/title/i).fill("Follow up with E2E Test Contact");
    await page.getByLabel(/due date/i).fill("2026-08-15");
    await page.getByRole("button", { name: /create task/i }).click();
    await expect(page.getByText("Follow up with E2E Test Contact")).toBeVisible();
  });

  test("flow 19b: an overdue task reminder appears in the notification bell", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    // Assumes a task fixture seeded with due_at in the past and the
    // NotifyOverdueTasks scheduled command already run once against it.
    await page.getByRole("button", { name: /notifications/i }).click();
    await expect(page.getByText(/task.*overdue/i)).toBeVisible();
  });
});
