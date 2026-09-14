"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: DrawerProps) {
  return (
    <>
      {open && <DrawerOverlay onClick={onClose} />}
      <div
        className={cn(
          "fixed z-50 flex h-full w-full flex-col bg-surface shadow-2xl",
          {
            "inset-x-0 inset-y-0": size === "full",
            "inset-y-0 right-0 w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl": size === "md",
            "inset-y-0 right-0 w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl": size === "lg",
            "inset-y-0 right-0 top-0 h-full w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl": size === "sm",
          },
          className
        )}
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
        {footer && <DrawerFooter>{footer}</DrawerFooter>}
        <DrawerClose onClick={onClose} className="absolute top-2 right-2 rounded-lg p-1 text-muted hover:text-text">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </DrawerClose>
      </div>
    </>
  );
}

function DrawerOverlay({ onClick }: { onClick: () => void }) {
  return <div className="fixed inset-0 bg-black/40 z-40" onClick={onClick} />;
}

function DrawerClose({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-7 w-7 items-center justify-center rounded-lg", className)} aria-label="Close">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function DrawerHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-col px-5 py-4 border-b border-border/70", className)}>{children}</div>;
}

function DrawerTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-lg font-semibold text-text", className)}>{children}</h2>;
}

function DrawerDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-1 text-sm text-muted", className)}>{children}</p>;
}

function DrawerBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-1 flex-col p-5 overflow-y-auto", className)}>{children}</div>;
}

function DrawerFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-col border-t border-border/70 p-5", className)}>{children}</div>;
}
