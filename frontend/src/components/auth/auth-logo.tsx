import { MessageCircleMore } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact auth brand mark shared by login and signup.
 */
export function AuthLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "border-auth-green/35 bg-auth-green inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-[#07110b]",
        className
      )}
    >
      <MessageCircleMore aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
    </span>
  );
}
