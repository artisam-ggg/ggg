import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AnalyticsConsent } from "@/components/analytics/AnalyticsConsent";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "GGG — Good Game Guild",
  description: "Trustless tournament prize-escrow protocol on Stellar Soroban.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className="bg-background text-on-surface antialiased">
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
