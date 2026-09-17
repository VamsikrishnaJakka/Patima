import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PATIMA — Evidence-First Professional Ecosystem",
  description: "Inspectable technical capability and evidence-first hiring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
