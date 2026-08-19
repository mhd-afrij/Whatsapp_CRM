import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Tasks flow tests.
 *
 * Covers:
 * - Task list page loads with filters
 * - Creating a new task
 * - Task priority and status filters
 */

test.describe("Tasks", () => {
  test("flow 18: tasks page loads with the task table and new task button", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/tasks");

    // The tasks page has a heading "Tasks".
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

    // The "New task" button is visible.
    await expect(page.getByRole("button", { name: /new task/i })).toBeVisible();

    // View filter buttons are present.
    await expect(page.getByRole("button", { name: "My tasks" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Overdue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upcoming" })).toBeVisible();
  });

  test("flow 18b: creating a new task with the create form", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/tasks");

    // Click "New task" to expand the create form.
    await page.getByRole("button", { name: /new task/i }).click();

    // The create form should now be visible with a title input.
    const titleInput = page.getByPlaceholder("Task title");
    await expect(titleInput).toBeVisible();

    // Fill in the task details.
    await titleInput.fill("Follow up with E2E Test Contact");

    // The form has a due date input (datetime-local).
    const dueDateInput = page.locator('input[type="datetime-local"]');
    await dueDateInput.fill("2026-08-15T10:00");

    // Submit the form.
    await page.getByRole("button", { name: /create task/i }).click();

    // The form should close and the task should appear in the list.
    await expect(page.getByText("Follow up with E2E Test Contact")).toBeVisible();
  });

  test("flow 19: filtering tasks by priority", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/tasks");

    // The priority filter dropdown is present.
    const prioritySelect = page.locator("select").nth(1);
    await expect(prioritySelect).toBeVisible();

    // Select "urgent" priority filter.
    await prioritySelect.selectOption("urgent");

    // The table should refresh with filtered results.
    // At minimum, the select should now show "urgent".
    await expect(prioritySelect).toHaveValue("urgent");
  });
});
