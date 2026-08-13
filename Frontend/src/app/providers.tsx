"use client";

import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/context/auth-context";
import { SocketProvider } from "@/providers/socket-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/context/theme-context";
import { KeyboardShortcutsProvider } from "@/providers/keyboard-shortcuts-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider>
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>
              <SocketProvider>
                <KeyboardShortcutsProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </KeyboardShortcutsProvider>
              </SocketProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
