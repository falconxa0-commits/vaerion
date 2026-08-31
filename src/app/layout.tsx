import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vaerion — AI-native development engine",
  description:
    "Local-first, deterministic, auditable by construction. Every step journaled, every decision brokered, every output reproducible.",
  keywords: ["Vaerion", "AI engine", "AI-native development", "determinism", "local-first", "auditable", "reproducible builds"],
  authors: [{ name: "Auren" }],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Vaerion — AI-native development engine",
    description:
      "Local-first, deterministic, auditable by construction. Every step journaled, every decision brokered, every output reproducible.",
    url: "/",
    siteName: "Vaerion",
    images: ["/og-image.png"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
