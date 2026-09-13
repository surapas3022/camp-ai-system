import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI System v0 — Lab 4 release criteria",
  description: "Cited RAG, bounded agent workflow, and a staff-run release-criteria dashboard with evaluation, metrics, and privacy-minimised feedback.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
