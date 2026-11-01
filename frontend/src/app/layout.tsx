import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query";
import { ThemeProvider, themeInitScript } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { EventProvider } from "@/lib/event-context";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/auth/auth-gate";
import { CommandPaletteProvider } from "@/components/shell/command-palette";
import { TooltipProvider } from "@/components/ui/shadcn/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "LoadTruth",
    template: "%s · LoadTruth",
  },
  description:
    "LoadTruth helps disaster-debris teams review truck footage, fill estimates, flagged issues, and cubic-yard tickets.",
  icons: {
    icon: [
      {
        url: "/icons/favicon-light.svg",
        media: "(prefers-color-scheme: light)",
        type: "image/svg+xml",
      },
      {
        url: "/icons/favicon-dark.svg",
        media: "(prefers-color-scheme: dark)",
        type: "image/svg+xml",
      },
    ],
    shortcut: ["/icons/favicon-dark.svg"],
    apple: [
      {
        url: "/icons/light/png/loadtruth-light-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          id="app-favicon-light"
          type="image/svg+xml"
          href="/icons/favicon-light.svg"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          id="app-favicon-dark"
          type="image/svg+xml"
          href="/icons/favicon-dark.svg"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="apple-touch-icon" href="/icons/light/png/loadtruth-light-180.png" />
        {/* Set the theme before paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider delayDuration={200}>
              <AuthProvider>
                <AuthGate>
                  <EventProvider>
                    <ToastProvider>
                      <CommandPaletteProvider>{children}</CommandPaletteProvider>
                    </ToastProvider>
                  </EventProvider>
                </AuthGate>
              </AuthProvider>
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
