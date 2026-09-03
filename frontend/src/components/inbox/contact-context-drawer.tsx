"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ContactContextPanel } from "./contact-context-panel";

interface ContactContextDrawerProps {
  conversationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactContextDrawer({
  conversationId,
  open,
  onOpenChange,
}: ContactContextDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[330px] sm:w-[330px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Contact Information</SheetTitle>
        </SheetHeader>
        <div className="h-full min-w-0 overflow-hidden">
          <ContactContextPanel conversationId={conversationId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
