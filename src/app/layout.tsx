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
      <body>{children}</body>
    </html>
  );
}
