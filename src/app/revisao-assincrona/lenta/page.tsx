import { notFound } from "next/navigation";
import { accessibilityReviewAvailable } from "@/lib/accessibility-review";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!accessibilityReviewAvailable()) notFound();
  await new Promise(resolve => setTimeout(resolve, 2000));
  return <main className="panel"><h1>Página carregada</h1><p>Conteúdo fictício para validar o carregamento da rota.</p></main>;
}
