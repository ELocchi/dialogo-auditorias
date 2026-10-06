import { requireActiveProfile } from "@/lib/auth/session";
import { BackHeading, BackLink } from "@/app/components/back-control";
import { JobsPanel } from "@/app/components/jobs-panel";
export default async function JobsPage() {
  await requireActiveProfile();
  return <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 20px" }}><BackHeading><BackLink href="/app" label="Voltar" /><h1>Processamentos</h1></BackHeading><JobsPanel /></main>;
}
