import { notFound } from "next/navigation";
import { accessibilityReviewAvailable } from "@/lib/accessibility-review";
import Review from "./review";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ fluxo?: string }> }) {
 if (!accessibilityReviewAvailable()) notFound();
 return <Review flow={(await searchParams).fluxo ?? "lista"} />;
}
