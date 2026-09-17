"use client";

import type { ReactNode } from "react";

export default function WorkspaceSettingsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl">{children}</div>;
}

