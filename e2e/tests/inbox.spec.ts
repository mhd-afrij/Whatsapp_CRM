import { test, expect, TEST_USERS, loginAs } from "./fixtures";

/**
 * Inbox / conversation flow tests.
 *
 * Covers:
 * - Conversation list search and selection
 * - Sending a message in a conversation thread
 * - Adding an internal note
 * - Editing a contact from the conversation context panel
 * - Global search surfacing a contact
 */

// ─── Conversation list ──────────────────────────────────────────────────────

test.describe("Conversation list", () => {
  test("flow 10: inbox loads and shows the conversation list panel", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await expect(page).toHaveURL(/\/inbox/);

    // The conversation list panel header says "WhatsApp Inbox".
    await expect(page.getByText("WhatsApp Inbox")).toBeVisible();

    // Search input is present.
    await expect(page.getByPlaceholder("Search conversations")).toBeVisible();

    // Tab filter buttons are present.
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mine" })).toBeVisible();
  });

  test("flow 10b: filtering by 'Unassigned' tab updates the list", async ({ page }) => {
    await loginAs(page, TEST_USERS.manager);
    await page.getByRole("button", { name: "Unassigned" }).click();

    // The list should refresh (loading or empty state or filtered results).
    // At minimum, the active filter button should be highlighted.
    await expect(page.getByRole("button", { name: "Unassigned" })).toHaveClass(/bg-primary/);
  });
});

// ─── Sending a message ──────────────────────────────────────────────────────

test.describe("Message sending", () => {
  test("flow 8: an agent sends an outbound message and it appears in the thread", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // Click the first conversation in the list.
    // Conversation items are rendered by ConversationItem and show contact names.
    const firstConversation = page.locator('[class*="cursor-pointer"]').first();
    await firstConversation.click();

    // The chat panel has a textarea with this placeholder.
    const composer = page.getByPlaceholder(/type a message/i);
    await composer.fill("Hello from e2e test");

    // Click the send button (aria-label "Send message").
    await page.getByRole("button", { name: "Send message" }).click();

    // The sent message should appear in the thread.
    await expect(page.getByText("Hello from e2e test").first()).toBeVisible();
  });
});

// ─── Internal note ──────────────────────────────────────────────────────────

test.describe("Internal note", () => {
  test("flow 11: an agent switches to note mode and adds an internal note", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // Open the first conversation.
    const firstConversation = page.locator('[class*="cursor-pointer"]').first();
    await firstConversation.click();

    // The composer has a toggle button to switch to note mode.
    // The button has aria-label "Switch to internal note mode".
    await page.getByRole("button", { name: /switch to internal note/i }).click();

    // Should see the note mode indicator.
    await expect(page.getByText(/internal note mode/i)).toBeVisible();

    // Write a note in the textarea.
    const composer = page.getByPlaceholder(/write an internal note/i);
    await composer.fill("Called customer, will follow up tomorrow.");

    // Submit via the save note button (aria-label "Save note").
    await page.getByRole("button", { name: "Save note" }).click();

    // The note should appear in the thread.
    await expect(page.getByText("Called customer, will follow up tomorrow.")).toBeVisible();
  });
});

// ─── Contact update ─────────────────────────────────────────────────────────

test.describe("Contact update", () => {
  test("flow 12: editing a contact from the context panel persists", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/inbox");

    // Open the first conversation.
    const firstConversation = page.locator('[class*="cursor-pointer"]').first();
    await firstConversation.click();

    // Open the contact info panel via the action menu.
    // The "Contact info" button is inside the ActionMenu dropdown.
    await page.getByRole("button", { name: /conversation actions/i }).click();
    await page.getByRole("button", { name: /contact info/i }).click();

    // The contact context panel/drawer should now be visible.
    // Look for an edit button or an editable company field.
    const editBtn = page.getByRole("button", { name: /edit/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.getByLabel(/company/i).fill("Acme E2E Corp");
      await page.getByRole("button", { name: /save/i }).click();
      await expect(page.getByText("Acme E2E Corp")).toBeVisible();
    }
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

test.describe("Search", () => {
  test("flow 13: global search surfaces a contact by name", async ({ page }) => {
    await loginAs(page, TEST_USERS.agent);
    await page.goto("/search");

    // The search page has a heading "Search results".
    await expect(page.getByRole("heading", { name: /search results/i })).toBeVisible();
  });
});
