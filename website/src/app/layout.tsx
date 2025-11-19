import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google"; // 引入字体
import "./globals.css";
import { Toaster } from "@/components/ui/sonner"; // 引入 Toaster

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "KernelSU Keyring",
  description: "Developer Identity Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans antialiased bg-slate-50 dark:bg-slate-950`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}