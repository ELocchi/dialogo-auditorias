import Link from "next/link";

export function AccessibilityReviewNavigation() {
  return <header className="panel" style={{ margin: "16px auto", maxWidth: 1200 }}>
    <p><strong>Homologação de acessibilidade — NVDA</strong></p>
    <p>Dados fictícios. As respostas ficam nesta guia; recarregar reinicia o teste. Use imagens de teste.</p>
    <nav aria-label="Telas de homologação" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Link href="/revisao-acessibilidade">Botões e diálogos</Link>
      <Link href="/revisao-acessibilidade/qualidade">Auditoria de Qualidade</Link>
      <Link href="/revisao-seguranca">Auditoria de Segurança</Link>
      <Link href="/entrar">Tela de entrada</Link>
    </nav>
    <p className="muted">Versão {process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "local"}. Gravações e publicações estão bloqueadas neste ambiente.</p>
  </header>;
}
