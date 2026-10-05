import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { accessibilityReviewAvailable } from "@/lib/accessibility-review";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!accessibilityReviewAvailable()) notFound();
  if ((await cookies()).get("async-review-fail")?.value === "1") throw new Error("Falha simulada na página de teste");
  return <main className="panel"><h1>Página recuperada</h1><p>A consulta de teste voltou a responder.</p></main>;
}
