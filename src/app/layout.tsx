import type { Metadata, Viewport } from "next";
import { Archivo, Geist } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-archivo" });
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });

export const metadata: Metadata = { title: "Marathon Coach", description: "Honolulu Marathon training" };
export const viewport: Viewport = { themeColor: "#11151b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${geist.variable}`}>
      <body className="min-h-dvh bg-app font-ui text-white antialiased">{children}</body>
    </html>
  );
}
