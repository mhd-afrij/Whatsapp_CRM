import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./modal";

/**
 * Regression test for the analytics settings page
 * (/settings/workspace/analytics): the modal used to render its
 * `fixed inset-0 z-50` wrapper even while closed - only the backdrop and the
 * content were conditional. That invisible wrapper still covered the whole
 * viewport with pointer events enabled, so any page mounting a Modal (the
 * analytics page mounts two: "Reset analytics settings?" and "Unsaved
 * changes") had every control behind it silently unclickable - tabs, toggles,
 * selects, Save Changes and Reset to Defaults all looked dead.
 *
 * The wrapper must therefore not exist in the DOM at all while closed, and
 * must come back (with its content) once opened.
 */
describe("Modal", () => {
  it("renders nothing while closed so it cannot swallow clicks on the page underneath", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Reset analytics settings?">
        <p>Reset all analytics settings for this workspace to the recommended defaults?</p>
      </Modal>
    );

    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Reset analytics settings?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close modal" })).not.toBeInTheDocument();
  });

  it("renders the overlay, title, body, footer and close button once open", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <Modal
        open
        onClose={onClose}
        title="Reset analytics settings?"
        footer={<button type="button">Reset Settings</button>}
      >
        <p>Reset all analytics settings for this workspace to the recommended defaults?</p>
      </Modal>
    );

    expect(container.querySelector(".fixed.inset-0")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Reset analytics settings?" })).toBeInTheDocument();
    expect(
      screen.getByText("Reset all analytics settings for this workspace to the recommended defaults?")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mounts and unmounts across open/close transitions (unsaved-changes guard flow)", () => {
    const onClose = vi.fn();

    const { container, rerender } = render(
      <Modal open={false} onClose={onClose} title="Unsaved changes">
        <p>You have unsaved analytics settings. Leave without saving?</p>
      </Modal>
    );
    expect(container.querySelector(".fixed.inset-0")).toBeNull();

    rerender(
      <Modal open onClose={onClose} title="Unsaved changes">
        <p>You have unsaved analytics settings. Leave without saving?</p>
      </Modal>
    );
    expect(container.querySelector(".fixed.inset-0")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Unsaved changes" })).toBeInTheDocument();

    rerender(
      <Modal open={false} onClose={onClose} title="Unsaved changes">
        <p>You have unsaved analytics settings. Leave without saving?</p>
      </Modal>
    );
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });
});
