import { test as base, type Page } from "@playwright/test";

/**
 * Shared test fixtures: login helper + seeded test credentials.
 *
 * Credentials assume a seeded test workspace matching
 * backend/database/seeders/RolePermissionSeeder.php's system roles
 * (Super Administrator / Administrator / Manager / Agent / Viewer),
 * with one known user per role.
 */

export const TEST_USERS = {
  administrator: { email: "e2e-admin@example.com", password: "Password123!" },
  manager: { email: "e2e-manager@example.com", password: "Password123!" },
  agent: { email: "e2e-agent@example.com", password: "Password123!" },
  viewer: { email: "e2e-viewer@example.com", password: "Password123!" },
};

/**
 * Log in via the real /login page.
 *
 * The login form uses react-hook-form with id="email" and id="password"
 * inputs and a submit button labeled "Sign in".
 */
export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");

  // Fill the form fields using their `id` attributes (React Hook Form registers them).
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);

  // Submit via the "Sign in" button.
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect to the dashboard inbox.
  await page.waitForURL("**/inbox", { timeout: 15_000 });
}

/**
 * Wait for a toast notification matching the given text pattern.
 * The app uses a toast provider; toasts appear with role="status" or
 * a visible text container.
 */
export async function waitForToast(page: Page, pattern: RegExp | string) {
  const toast = page.getByText(pattern).first();
  await toast.waitFor({ state: "visible", timeout: 10_000 });
  return toast;
}

export const test = base;
export { expect } from "@playwright/test";
