"use client";

import { Inbox, Target, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { AuthLogo } from "./auth-logo";

const PROOF_POINTS = [
  { icon: Inbox, label: "Unified Inbox" },
  { icon: Target, label: "Lead Management" },
  { icon: UsersRound, label: "Team Collaboration" },
] as const;

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-auth-bg text-auth-text flex h-dvh flex-col">
      <div className="mx-auto grid h-full w-full lg:grid-cols-[56%_44%]">
        <aside className="border-auth-border bg-auth-panel hidden h-full overflow-y-auto border-r lg:flex">
          <AuthBrandPanel />
        </aside>

        <main className="bg-auth-bg flex min-h-0 min-w-0 flex-col overflow-y-auto px-5 py-6 sm:px-8 sm:py-10 lg:px-12 xl:px-16">
          <div className="mx-auto my-auto w-full max-w-[448px]">{children}</div>
          <MobileProofStrip />
        </main>
      </div>
    </div>
  );
}

function AuthBrandPanel() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col justify-between px-10 py-10 xl:px-16 xl:py-12">
      <div className="flex items-center gap-3">
        <AuthLogo />
        <div>
          <p className="text-auth-text text-[15px] font-semibold">WhatsCRM</p>
          <p className="text-auth-muted text-xs">Conversation operations</p>
        </div>
      </div>

      <div className="my-12 max-w-[620px]">
        <h1 className="text-auth-text text-[40px] leading-[1.1] font-semibold text-balance xl:text-[48px]">
          Turn WhatsApp conversations into customer relationships.
        </h1>
        <p className="text-auth-muted mt-5 max-w-[540px] text-[15px] leading-7">
          One shared inbox with the context your team needs to respond, qualify, and follow
          through — together.
        </p>
      </div>

      <ul className="border-auth-border grid grid-cols-3 border-t pt-6">
        {PROOF_POINTS.map(({ icon: Icon, label }) => (
          <li key={label} className="text-auth-subtle flex items-center gap-2 text-xs">
            <Icon aria-hidden="true" className="text-auth-green h-4 w-4" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileProofStrip() {
  return (
    <ul className="border-auth-border mx-auto mt-8 flex w-full max-w-[448px] flex-col gap-2.5 border-t pt-5 lg:hidden">
      {PROOF_POINTS.map(({ icon: Icon, label }) => (
        <li key={label} className="text-auth-subtle flex items-center gap-2 text-xs">
          <Icon aria-hidden="true" className="text-auth-green h-4 w-4" />
          {label}
        </li>
      ))}
    </ul>
  );
}
