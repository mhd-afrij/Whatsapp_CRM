import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind CSS.
 * @param  {...import("clsx").ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string for display.
 * @param {string|Date} date
 * @param {{ dateStyle?: string, timeStyle?: string }} options
 * @returns {string}
 */
export function formatDate(date, options = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    dateStyle: options.dateStyle ?? "medium",
    timeStyle: options.timeStyle,
  });
}

/**
 * Format a date as relative time (e.g., "2 hours ago").
 * @param {string|Date} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return formatDate(date);
}

/**
 * Format time only (e.g., "2:30 PM").
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Format duration in seconds to human readable.
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "\u2014";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
}
