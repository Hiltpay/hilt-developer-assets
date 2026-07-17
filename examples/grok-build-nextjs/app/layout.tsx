import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hilt Pay API protected route",
  description: "Runnable Hilt Pay API and Grok Build protected-resource example.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
