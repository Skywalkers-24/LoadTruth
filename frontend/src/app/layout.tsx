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
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
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
