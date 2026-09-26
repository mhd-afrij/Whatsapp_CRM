import { describe, expect, it } from "vitest";
import { asArray, isNotTracked, type AnalyticsNotTrackedResult } from "./analytics-api";

const notTrackedAnalytics: AnalyticsNotTrackedResult = { tracked: false, unavailable_reason: "analytics_disabled" };
const notTrackedMetric: AnalyticsNotTrackedResult = { tracked: false, unavailable_reason: "metric_not_tracked" };
const emptySeries: unknown[] = [];
const series = [{ date: "2026-01-01", count: 5 }];

describe("isNotTracked", () => {
  it("returns true for analytics_disabled payload", () => {
    expect(isNotTracked(notTrackedAnalytics)).toBe(true);
  });

  it("returns true for metric_not_tracked payload", () => {
    expect(isNotTracked(notTrackedMetric)).toBe(true);
  });

  it("returns false for an array", () => {
    expect(isNotTracked(series)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNotTracked(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNotTracked(null)).toBe(false);
  });

  it("returns false for a plain object without tracked: false", () => {
    expect(isNotTracked({ foo: "bar" })).toBe(false);
  });
});

describe("asArray", () => {
  it("returns empty array for analytics_disabled", () => {
    expect(asArray(notTrackedAnalytics)).toEqual([]);
  });

  it("returns empty array for metric_not_tracked", () => {
    expect(asArray(notTrackedMetric)).toEqual([]);
  });

  it("returns the series as-is", () => {
    expect(asArray(series)).toEqual(series);
  });

  it("returns empty array for undefined", () => {
    expect(asArray(undefined)).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(asArray(null as unknown as unknown[])).toEqual([]);
  });

  it("preserves empty array", () => {
    expect(asArray(emptySeries)).toEqual([]);
  });
});