import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyEnterprisePortal",
  description: "Modular, multi-tenant Employee Self-Service portal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
