import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Patient lead board",
  description:
    "Design preview of the premium healthcare WhatsApp lead kanban: drag & drop cards, dark mode, unread badges and reminders.",
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
