import type { Metadata } from "next";
import { parseEnvironment } from "@/lib/validation/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ReturnWise AI", template: "%s · ReturnWise AI" },
  description: "A careful, sandbox-only workspace for merchant returns.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  parseEnvironment(process.env);
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
