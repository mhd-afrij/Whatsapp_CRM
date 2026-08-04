import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Written but not executed in this environment - see e2e/README.md.
 * Covers flows 6-9: WhatsApp QR connection, incoming message, outgoing
 * message, delivery ack. All require the "headless WhatsApp simulator" /
 * test adapter described in docs/09-testing-strategy.md §5, which does not
 * exist in this codebase yet (Phase 19+ prerequisite).
 */

test.describe("WhatsApp connection", () => {
  test("flow 6: administrator scans a QR (test adapter) and the session goes to connected", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.administrator);
    await page.goto("/settings/whatsapp");
    await page.getByRole("button", { name: /connect/i }).click();
    await expect(page.getByText(/scan this qr code/i)).toBeVisible();

    // The test adapter would emit a synthetic 'connection.update' -> open
    // event here in place of a real phone scan.
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Message lifecycle", () => {
  test("flow 7: an inbound message from the test adapter appears in the inbox in realtime", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // In a real run: the test adapter injects a fake Baileys 'messages.upsert'
    // event for a known contact, the gateway writes it and emits over
    // Socket.IO, and the inbox list updates without a page reload.
    await expect(page.getByText(/e2e test contact/i)).toBeVisible({ timeout: 10_000 });
  });

  test("flow 8: an agent sends an outbound message and it appears as sent in the thread", async ({
    page,
  }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");
    await page.getByText(/e2e test contact/i).first().click();
    await page.getByPlaceholder(/type a message/i).fill("Hello from e2e");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Hello from e2e")).toBeVisible();
  });

  test("flow 9: a delivery ack updates the sent message's status indicator", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");
    await page.getByText(/e2e test contact/i).first().click();
    const sentMessage = page.getByText("Hello from e2e").first();
    await expect(sentMessage).toBeVisible();

    // The test adapter would emit a synthetic 'messages.update' status event
    // (sent -> delivered) here.
    await expect(page.getByTestId("message-status-delivered")).toBeVisible({ timeout: 10_000 });
  });
});
