const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

function formatWithTimeZone(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null
): string {
  const date = new Date(iso);

  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function dateKey(iso: string, timeZone?: string | null): string {
  const date = new Date(iso);

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back below.
  }

  return date.toLocaleDateString();
}

export function formatInboxTime(iso: string | null, timeZone?: string | null): string {
  if (!iso) return "";
  return formatWithTimeZone(iso, TIME_FORMAT_OPTIONS, timeZone);
}

export function formatInboxDateOrTime(
  iso: string | null,
  todayIso: string,
  timeZone?: string | null
): string {
  if (!iso) return "";
  return dateKey(iso, timeZone) === dateKey(todayIso, timeZone)
    ? formatWithTimeZone(iso, TIME_FORMAT_OPTIONS, timeZone)
    : formatWithTimeZone(iso, DATE_FORMAT_OPTIONS, timeZone);
}

export function formatInboxDateSeparator(iso: string, timeZone?: string | null): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(iso, timeZone) === dateKey(today.toISOString(), timeZone)) {
    return "Today";
  }
  if (dateKey(iso, timeZone) === dateKey(yesterday.toISOString(), timeZone)) {
    return "Yesterday";
  }

  return formatWithTimeZone(iso, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }, timeZone);
}

export function isSameInboxDay(leftIso: string, rightIso: string, timeZone?: string | null): boolean {
  return dateKey(leftIso, timeZone) === dateKey(rightIso, timeZone);
}

/**
 * Format time like WhatsApp: show time today (11:30 AM), "Yesterday",
 * day name this week (Mon, Tue), or date (12/31) for older messages.
 */
export function formatWhatsAppTime(iso: string | null, timeZone?: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  const now = new Date();

  try {
    // Get date keys
    const today = dateKey(now.toISOString(), timeZone);
    const targetDate = dateKey(iso, timeZone);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = dateKey(yesterday.toISOString(), timeZone);

    // Today: show time (11:30 AM)
    if (today === targetDate) {
      return formatWithTimeZone(iso, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }, timeZone);
    }

    // Yesterday: show "Yesterday"
    if (yesterdayKey === targetDate) {
      return "Yesterday";
    }

    // This week (last 7 days): show day name (Mon, Tue)
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo < 7) {
      return formatWithTimeZone(iso, {
        weekday: "short",
      }, timeZone);
    }

    // Older (>7 days): show date (12/31) or (Dec 31)
    return formatWithTimeZone(iso, {
      month: "2-digit",
      day: "2-digit",
    }, timeZone);
  } catch {
    // Fallback to just time
    return formatWithTimeZone(iso, TIME_FORMAT_OPTIONS, timeZone);
  }
}
