import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Aria – Aura Skincare Voice Support",
  description: "AI voice customer support agent for Aura Skincare",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
