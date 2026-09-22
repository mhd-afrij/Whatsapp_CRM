// Locale-ish helpers for the Reports dashboard (see reports-api.ts for the backend shape).

export function formatMoney(value: number | null | undefined, currency: string): string {
  const amount = Math.round(value ?? 0).toLocaleString();
  return currency ? `${amount} ${currency}` : `$${amount}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value == null ? "--" : `${value.toFixed(digits)}%`;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value == null) return "N/A";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h`;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function weekdayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}