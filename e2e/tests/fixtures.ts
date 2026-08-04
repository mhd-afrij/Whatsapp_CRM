import { test as base, type Page } from "@playwright/test";

/**
 * Shared login helper + seeded test credentials. Written but not executed in
 * this environment - see e2e/README.md. Credentials assume a seeded test
 * workspace matching backend/database/seeders/RolePermissionSeeder.php's 5
 * system roles (Super Administrator / Administrator / Manager / Agent /
 * Viewer), with one known user per role.
 */
export const TEST_USERS = {
  administrator: { email: "e2e-admin@example.com", password: "Password123!" },
  manager: { email: "e2e-manager@example.com", password: "Password123!" },
  agent: { email: "e2e-agent@example.com", password: "Password123!" },
  viewer: { email: "e2e-viewer@example.com", password: "Password123!" },
};

export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/inbox");
}

export const test = base;
export { expect } from "@playwright/test";
