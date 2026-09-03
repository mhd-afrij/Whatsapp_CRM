import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatInboxDateOrTime,
  formatInboxDateSeparator,
  formatInboxTime,
  isSameInboxDay,
} from "./time-format";

describe("time-format", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats message times in the supplied timezone", () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date("2026-08-05T13:30:00Z"));

    expect(formatInboxTime("2026-08-05T13:30:00Z", "America/New_York")).toBe(expected);
  });

  it("uses workspace day boundaries when comparing messages", () => {
    expect(isSameInboxDay("2026-08-05T17:30:00Z", "2026-08-05T18:30:00Z", "Asia/Kolkata")).toBe(false);
    expect(isSameInboxDay("2026-08-05T18:30:00Z", "2026-08-05T20:00:00Z", "Asia/Kolkata")).toBe(true);
  });

  it("labels today and yesterday using the timezone-aware calendar day", () => {
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));

    expect(formatInboxDateSeparator("2026-08-05T09:00:00Z", "UTC")).toBe("Today");
    expect(formatInboxDateSeparator("2026-08-04T09:00:00Z", "UTC")).toBe("Yesterday");
  });

  it("switches between time and date for conversation list entries", () => {
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));

    const timeExpected = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date("2026-08-05T09:00:00Z"));
    const dateExpected = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date("2026-08-04T09:00:00Z"));

    expect(formatInboxDateOrTime("2026-08-05T09:00:00Z", "2026-08-05T12:00:00Z", "UTC")).toBe(
      timeExpected
    );
    expect(formatInboxDateOrTime("2026-08-04T09:00:00Z", "2026-08-05T12:00:00Z", "UTC")).toBe(
      dateExpected
    );
  });
});
