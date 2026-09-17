import { describe, it, expect } from "vitest";
import {
  CONNECTION_STATE_VIEW,
  resolveCanonicalState,
} from "./whatsapp-connection";

describe("whatsapp-connection canonical state model", () => {
  it("reduces every raw gateway status to a canonical state", () => {
    const cases = [
      ["idle", "connecting"],
      ["connecting", "connecting"],
      ["qr_pending", "connecting"],
      ["connected", "connected"],
      ["disconnected", "disconnected"],
      ["reconnecting", "reconnecting"],
      ["auth_required", "authentication_required"],
      ["error", "failure"],
    ] as const;

    for (const [raw, expected] of cases) {
      expect(
        resolveCanonicalState({ status: raw, qrCode: null, qrExpiresAt: null, phoneNumber: null })
      ).toBe(expected);
    }
  });

  it("defaults to connecting while there is no status data yet", () => {
    expect(resolveCanonicalState(undefined)).toBe("connecting");
  });

  it("treats gateway_unavailable as the recoverable, self-healing state", () => {
    const view = CONNECTION_STATE_VIEW.gateway_unavailable;
    expect(view.recoverable).toBe(true);
    expect(view.description).toBe("WhatsApp gateway is temporarily unavailable.");
    expect(view.dotClass).toContain("bg-warning");
  });

  it("describes connected and failure states faithfully", () => {
    expect(CONNECTION_STATE_VIEW.connected.recoverable).toBe(false);
    expect(CONNECTION_STATE_VIEW.connected.dotClass).toBe("bg-success");
    expect(CONNECTION_STATE_VIEW.failure.recoverable).toBe(false);
  });
});