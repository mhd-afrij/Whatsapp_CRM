import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/context/auth-context";
import { SocketProvider } from "@/providers/socket-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/context/theme-context";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appName = "CRM WhatsApp";
const appDescription =
  "A production-ready WhatsApp CRM for shared inboxes, contacts, deals, tasks, and team collaboration.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: appName,
    title: appName,
    description: appDescription,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: appDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning className="h-full overflow-hidden flex flex-col bg-bg text-text">
        {/* Set the theme class before first paint so there is no flash of the
            wrong scheme; mirrors the logic in context/theme-context.tsx. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark";var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("light",!d);}catch(e){}})();`,
          }}
        />
        <QueryProvider>
          <ToastProvider>
            <ThemeProvider>
              <AuthProvider>
                <SocketProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </SocketProvider>
              </AuthProvider>
            </ThemeProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
