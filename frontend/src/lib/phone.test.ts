import { describe, expect, it } from "vitest";
import { formatWhatsAppNumber } from "./phone";

describe("formatWhatsAppNumber", () => {
  it("strips the device suffix and pretty-prints +94 numbers", () => {
    expect(formatWhatsAppNumber("94788198996:20")).toBe("+94 78 819 8996");
  });

  it("formats clean numbers without a suffix", () => {
    expect(formatWhatsAppNumber("94788198996")).toBe("+94 78 819 8996");
  });

  it("falls back to a plain +number for other shapes", () => {
    expect(formatWhatsAppNumber("15551234567")).toBe("+15551234567");
  });

  it("returns null for empty input", () => {
    expect(formatWhatsAppNumber(null)).toBeNull();
    expect(formatWhatsAppNumber("")).toBeNull();
  });
});