import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "automomo",
  description: "Multi-agent human/AI orchestration for codebase runtimes",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
