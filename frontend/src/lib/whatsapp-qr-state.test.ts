import { describe, expect, it } from "vitest";
import { resolveWhatsappQrState, whatsappQrStateHint } from "./whatsapp-qr-state";

describe("resolveWhatsappQrState", () => {
  const fixedNow = new Date("2026-09-15T12:00:00Z");

  it("starts in generating when no QR has arrived yet", () => {
    expect(
      resolveWhatsappQrState({ status: "qr_pending", qrCode: null, qrExpiresAt: null }, fixedNow)
    ).toBe("generating");
  });

  it("moves to waiting while a fresh QR is on screen", () => {
    expect(
      resolveWhatsappQrState(
        {
          status: "qr_pending",
          qrCode: "data:image/png;base64,AAAA",
          qrExpiresAt: "2026-09-15T12:00:30Z",
        },
        fixedNow
      )
    ).toBe("waiting");
  });

  it("reports expired once the QR TTL passes", () => {
    expect(
      resolveWhatsappQrState(
        {
          status: "qr_pending",
          qrCode: "data:image/png;base64,AAAA",
          qrExpiresAt: "2026-09-15T11:59:00Z",
        },
        fixedNow
      )
    ).toBe("expired");
  });

  it("connected wins over a lingering QR", () => {
    expect(
      resolveWhatsappQrState(
        {
          status: "connected",
          qrCode: "data:image/png;base64,AAAA",
          qrExpiresAt: "2026-09-15T11:59:00Z",
        },
        fixedNow
      )
    ).toBe("connected");
  });

  it("connecting/reconnecting maps to connecting", () => {
    expect(
      resolveWhatsappQrState({ status: "reconnecting", qrCode: null, qrExpiresAt: null }, fixedNow)
    ).toBe("connecting");
  });

  it("error state wins when the backend reported one", () => {
    expect(
      resolveWhatsappQrState(
        { status: "error", qrCode: null, qrExpiresAt: null, error: "boom" },
        fixedNow
      )
    ).toBe("error");
  });
});

describe("whatsappQrStateHint", () => {
  it("renders the required copy for each state", () => {
    expect(whatsappQrStateHint("generating")).toBe("Generating QR...");
    expect(whatsappQrStateHint("waiting")).toBe("Waiting for WhatsApp connection...");
    expect(whatsappQrStateHint("connected")).toBe("WhatsApp connected successfully.");
    expect(whatsappQrStateHint("expired")).toContain("QR expired");
  });
});
