import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { AppwritePing } from "@/components/appwrite-ping";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Quotebook",
  description:
    "State a procurement need; Quotebook finds suppliers, requests real quotes by email, and compares them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(geist.variable, mono.variable)}>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AppwritePing />
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
