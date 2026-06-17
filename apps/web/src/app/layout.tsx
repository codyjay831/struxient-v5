import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProviders } from "@/components/providers/theme-providers";
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
  title: {
    default: "Struxient",
    template: "%s | Struxient",
  },
  description:
    "Construction management for trades—quotes, execution, and the Workstation.",
  applicationName: "Struxient",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProviders>{children}</ThemeProviders>
      </body>
    </html>
  );
}
