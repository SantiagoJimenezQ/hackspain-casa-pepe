import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Casa Pepe — Operations center",
  description:
    "Operations dashboard for the Casa Pepe incident coordinator.",
};

const themeBootScript = `(() => { try { const theme = localStorage.getItem("casa-pepe-theme"); const dark = theme ? theme === "dark" : true; document.documentElement.classList.toggle("dark", dark); } catch {} })();`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="h-full overflow-x-auto overflow-y-hidden bg-background text-foreground">
        <TooltipProvider>
          <ThemeProvider>
            <LocaleProvider>
              <DashboardProvider>
                <DashboardShell>{children}</DashboardShell>
              </DashboardProvider>
            </LocaleProvider>
          </ThemeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
