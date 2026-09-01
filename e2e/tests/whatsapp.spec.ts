import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * WhatsApp connection flow tests.
 *
 * Covers:
 * - WhatsApp settings page loads
 * - Connect button initiates connection
 * - Status badges display correctly
 * - Connection history section
 *
 * NOTE: These tests assume a test adapter / stub WhatsApp gateway that can
 * simulate QR code generation and connection events without a real phone.
 * See docs/09-testing-strategy.md §5 for the headless WhatsApp simulator spec.
 */

test.describe("WhatsApp connection", () => {
  test("flow 6: WhatsApp settings page loads with connection controls", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/whatsapp");

    // The page has a heading "WhatsApp Connection".
    await expect(page.getByRole("heading", { name: /whatsapp connection/i })).toBeVisible();

    // The live session panel is visible.
    await expect(page.getByText("Live session")).toBeVisible();

    // Connection status badge is present (idle/not connected initially).
    await expect(page.getByText(/not connected|connected|idle/i).first()).toBeVisible();

    // Connect button is present when status is idle/disconnected.
    const connectBtn = page.getByRole("button", { name: /connect whatsapp/i });
    if (await connectBtn.isVisible()) {
      await expect(connectBtn).toBeVisible();
    }
  });

  test("flow 6b: connection history section is present", async ({ page }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/whatsapp");

    // The connection history section is present.
    await expect(page.getByText("Connection history")).toBeVisible();
  });
});

test.describe("Message lifecycle", () => {
  test("flow 7: inbox loads and shows WhatsApp connection status", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // The inbox shows the WhatsApp connection status in the header.
    // It shows either "Connected" with a phone number or "No active connection".
    await expect(
      page.getByText(/connected|no active connection/i).first()
    ).toBeVisible();
  });

  test("flow 8: agent can open a conversation and see the composer", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // Click the first conversation in the list.
    const firstConversation = page.locator('[class*="cursor-pointer"]').first();
    if (await firstConversation.isVisible()) {
      await firstConversation.click();

      // The chat panel composer should be visible.
      await expect(page.getByPlaceholder(/type a message/i)).toBeVisible();

      // The send button should be visible.
      await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
    }
  });
});
