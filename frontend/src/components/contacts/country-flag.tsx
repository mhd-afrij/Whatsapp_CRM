"use client";

import type { ComponentType, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";

type FlagComponent = ComponentType<SVGProps<SVGSVGElement>>;

const FLAG_MAP = Flags as unknown as Record<string, FlagComponent | undefined>;

/**
 * Inline SVG country flag (3:2 ratio). Emoji flags are avoided because
 * Windows browsers do not render flag emoji at all (they show as two-letter
 * codes or empty boxes); inline SVGs render everywhere.
 */
export function CountryFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const Flag = FLAG_MAP[code.toUpperCase()];
  if (!Flag) return null;
  return <Flag aria-hidden className={className} />;
}
