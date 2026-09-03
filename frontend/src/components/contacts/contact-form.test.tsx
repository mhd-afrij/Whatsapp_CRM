import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContactForm } from "./contact-form";

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ContactForm onSubmit={onSubmit} />
    </QueryClientProvider>
  );
  return { onSubmit, ...utils };
}

/**
 * Phase 18: a critical form's Zod validation, per the roadmap item ("e.g.
 * deal creation - negative value rejected"). Deal creation in this codebase
 * has no dedicated Zod-validated form component to test (deals-api.ts's
 * DealFormValues is consumed directly, without a zod schema at the UI layer)
 * - ContactForm is the closest real equivalent (a Zod-validated create/edit
 * form actually shipped in the UI), so it stands in here. Noted as a real
 * gap in PROJECT_STATUS.md: deal creation has no client-side negative-value
 * guard today, only whatever the backend's FormRequest enforces.
 */
describe("ContactForm validation", () => {
  it("rejects a malformed email and does not call onSubmit", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows an empty email (optional field), submits null for blank optional fields, and auto-fills the browser timezone", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      full_name: "Jane Doe",
      email: null,
      company: null,
      job_title: null,
      phone_number: null,
      address: null,
      city: null,
      country: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      custom_fields: undefined,
    });
  });

  it("keeps the national number in the field and submits E.164 using the selected country code", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    const phoneInput = screen.getByLabelText(/phone number/i);
    await user.type(phoneInput, "0750144774");
    await user.tab();

    // The dropdown holds the +94 code; the field keeps the national number.
    expect(phoneInput).toHaveValue("0750144774");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: "94750144774" })
    );
  });

  it(
    "rejects a full name longer than 255 characters",
    async () => {
      const { onSubmit } = renderForm();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/full name/i), "a".repeat(256));
      await user.click(screen.getByRole("button", { name: /save/i }));

      await screen.findByRole("button", { name: /save/i });
      expect(onSubmit).not.toHaveBeenCalled();
    },
    20_000
  );
});
