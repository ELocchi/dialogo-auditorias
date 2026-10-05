import { notFound } from "next/navigation";
import { accessibilityReviewAvailable } from "@/lib/accessibility-review";
import SafetyReview from "./review";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!accessibilityReviewAvailable()) notFound();
  return <SafetyReview />;
}
