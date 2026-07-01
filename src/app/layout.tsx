import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-space" });
const geist = Geist({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-geist-mono" });

export const metadata: Metadata = { title: "Marathon Coach", description: "Honolulu Marathon training" };
export const viewport: Viewport = { themeColor: "#0B0C0E", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-app font-ui text-white antialiased">{children}</body>
    </html>
  );
}
