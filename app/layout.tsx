import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WastraJaga - Monitoring Busana Adat Pura",
  description: "Sistem monitoring kepatuhan busana adat pura berbasis Vision AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
