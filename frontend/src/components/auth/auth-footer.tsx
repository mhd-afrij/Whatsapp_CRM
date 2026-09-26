import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared auth footer link line ("New to WhatsCRM? Create an account" /
 * "Already have an account? Sign in"). One component so both pages keep the
 * exact same treatment.
 */
export function AuthFooter({
  text,
  linkHref,
  linkLabel,
}: {
  text: string;
  linkHref: string;
  linkLabel: ReactNode;
}) {
  return (
    <p className="text-auth-muted text-center text-sm">
      {text}{" "}
      <Link
        href={linkHref}
        className="text-auth-green focus-visible:outline-auth-green font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {linkLabel}
      </Link>
    </p>
  );
}
