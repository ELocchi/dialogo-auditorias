import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";

export default async function JobsPage() {
  await requireActiveProfile();
  redirect("/app");
}
