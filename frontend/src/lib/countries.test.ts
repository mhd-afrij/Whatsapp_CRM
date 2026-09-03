import { describe, it, expect } from "vitest";
import * as Flags from "country-flag-icons/react/3x2";
import { COUNTRIES, defaultCountry, detectCountryFromNumber } from "./countries";

describe("country list", () => {
  it("has a flag component for every listed country", () => {
    for (const c of COUNTRIES) {
      expect(
        Flags,
        `missing SVG flag for ${c.code} (${c.name})`
      ).toHaveProperty(c.code);
    }
  });

  it("lists the default +94 country (Sri Lanka) first for ambiguous codes", () => {
    expect(COUNTRIES[0]).toMatchObject({ code: "LK", dial: "94" });
  });
});

describe("defaultCountry", () => {
  it("returns Sri Lanka for the +94 default dialing code", () => {
    expect(defaultCountry("94")).toMatchObject({ code: "LK", dial: "94" });
  });

  it("falls back to the first country for an unknown dialing code", () => {
    expect(defaultCountry("999")).toBe(COUNTRIES[0]);
  });

  it("defaults to the +94 country when called without an argument", () => {
    expect(defaultCountry()).toMatchObject({ code: "LK", dial: "94" });
  });
});

describe("detectCountryFromNumber", () => {
  it("detects an explicit +dial number and strips the code", () => {
    expect(detectCountryFromNumber("+94 750144774")).toEqual({
      country: expect.objectContaining({ code: "LK", dial: "94" }),
      national: "750144774",
    });
  });

  it("detects a stored E.164 number without a leading +", () => {
    expect(detectCountryFromNumber("94750144774")).toEqual({
      country: expect.objectContaining({ code: "LK" }),
      national: "750144774",
    });
  });

  it("detects a US number", () => {
    expect(detectCountryFromNumber("+1 415 555 1234")).toEqual({
      country: expect.objectContaining({ code: "US", dial: "1" }),
      national: "4155551234",
    });
  });

  it("prefers the longest dialing code over +1 US/Canada", () => {
    expect(detectCountryFromNumber("+1246")).toEqual({
      country: expect.objectContaining({ code: "BB", dial: "1246" }),
      national: "",
    });
  });

  it("leaves a bare national number untouched", () => {
    expect(detectCountryFromNumber("765655026")).toBeNull();
    expect(detectCountryFromNumber("0750144774")).toBeNull();
  });

  it("returns null for empty or non-numeric input", () => {
    expect(detectCountryFromNumber("")).toBeNull();
    expect(detectCountryFromNumber("  ")).toBeNull();
    expect(detectCountryFromNumber("N/A")).toBeNull();
  });
});
