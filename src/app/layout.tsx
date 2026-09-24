import type { Metadata } from "next";
import "./globals.css";
import "./audit-workspace.css";
import "./operational-views.css";

export const metadata: Metadata = {
  title: "Diálogo Auditorias",
  description: "Auditorias de Segurança e Qualidade da Diálogo Engenharia",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body data-release="2026-09-24-publication-completes-schedule">{children}</body>
    </html>
  );
}
