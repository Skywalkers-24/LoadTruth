import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query";
import { ThemeProvider, themeInitScript } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { EventProvider } from "@/lib/event-context";
import { CommandPaletteProvider } from "@/components/shell/command-palette";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "LoadTruth · Video-verified load tickets",
  description:
    "Video-verified load tickets for disaster-debris hauling paid by the cubic yard. Measure truck-bed fill from camera evidence and produce auditable payment records.",
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
            <EventProvider>
              <ToastProvider>
                <CommandPaletteProvider>{children}</CommandPaletteProvider>
              </ToastProvider>
            </EventProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
