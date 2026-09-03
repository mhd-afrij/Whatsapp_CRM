import { describe, it, expect } from "vitest";
import { normalizePhoneNumber } from "./phone";

describe("normalizePhoneNumber", () => {
  it("drops the leading trunk zero and prefixes the country code", () => {
    expect(normalizePhoneNumber("0750144774")).toBe("94750144774");
  });

  it("prefixes the country code to a short local number", () => {
    expect(normalizePhoneNumber("765655026")).toBe("94765655026");
  });

  it("leaves an already-international number alone", () => {
    expect(normalizePhoneNumber("94765655026")).toBe("94765655026");
  });

  it("strips spaces, dashes and plus signs", () => {
    expect(normalizePhoneNumber("+94 76 5655-026")).toBe("94765655026");
  });

  it("returns the input unchanged when it has no digits", () => {
    expect(normalizePhoneNumber("")).toBe("");
    expect(normalizePhoneNumber("  ")).toBe("");
    expect(normalizePhoneNumber("N/A")).toBe("N/A");
  });

  it("honors an explicit country code", () => {
    expect(normalizePhoneNumber("0750144774", "1")).toBe("1750144774");
  });
});
