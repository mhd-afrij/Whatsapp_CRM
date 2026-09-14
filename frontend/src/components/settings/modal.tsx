"use client";

import * as React from "react";

interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  ...props
}: ModalProps) {
  return (
    <ModalOverlay open={open} onClose={onClose}>
      <ModalContent
        open={open}
        onClose={onClose}
        size={size}
        className={className}
        {...props}
      >
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {description && <ModalDescription>{description}</ModalDescription>}
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </ModalContent>
    </ModalOverlay>
  );
}

function ModalOverlay({ open, onClose, children, className }: Pick<ModalProps, "open" | "onClose" | "children" | "className"> & { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {open && <div className="absolute inset-0 bg-black/40" onClick={onClose} />}
      {open && children}
    </div>
  );
}

function ModalContent({
  open,
  onClose,
  children,
  size = "md",
  className,
  ...props
}: Pick<ModalProps, "open" | "onClose" | "children" | "size" | "className"> & React.HTMLAttributes<HTMLDivElement>) {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  return (
    <div className={cn("relative z-50 w-full", sizeClasses, className)}>
      <div
        className="rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute -top-2 -right-2 rounded-lg border border-border bg-surface p-1 text-muted hover:text-text"
        aria-label="Close modal"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ModalHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

function ModalTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-lg font-semibold text-text", className)}>{children}</h2>;
}

function ModalDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-1 text-sm text-muted", className)}>{children}</p>;
}

function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-h-0", className)}>{children}</div>;
}

function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-4", className)}>{children}</div>;
}
