import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
  title: "Casa Pepe — Centro de operaciones",
  description:
    "Dashboard de operaciones para el coordinador de incidentes de Casa Pepe.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-auto bg-background text-foreground">
        <TooltipProvider>
          <DashboardProvider>
            <DashboardShell>{children}</DashboardShell>
          </DashboardProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
