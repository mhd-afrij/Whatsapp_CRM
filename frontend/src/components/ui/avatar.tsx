const PALETTE = [
  "#16a34a",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4d7c0f",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

/** Deterministic colored initials avatar, used anywhere a contact/user has no photo. */
export function Avatar({
  name,
  size = "md",
  className,
  src,
}: {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  /** Optional photo (e.g. WhatsApp profile picture) - falls back to initials. */
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote profile photos, no next/image domain config
      <img
        src={src}
        alt={name}
        className={`inline-flex shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className ?? ""}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZE_CLASSES[size]} ${className ?? ""}`}
      style={{ backgroundColor: colorFor(name) }}
    >
      {initialsFor(name)}
    </span>
  );
}
