import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { followUpPhotoBucket, parsePhotoFileName, photoPath } from "@/lib/follow-up/photos";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ workId: string; fileName: string }> }) {
  const { workId, fileName } = await params;
  const parsed = parsePhotoFileName(fileName);
  if (!uuidPattern.test(workId) || !parsed) notFound();
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  if (!context || (context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE")
    || !context.works.some((work) => work.id === workId)) notFound();
  const client = await createClient();
  const { data: finding, error: findingError } = await client.from("follow_up_work_findings")
    .select("id").eq("id", parsed.findingId).eq("work_id", workId)
    .eq("auditor_auth_user_id", context.user.id).eq("photo_file_name", fileName).maybeSingle();
  if (findingError || !finding) notFound();
  const path = photoPath(context.user.id, workId, fileName);
  if (!path) notFound();
  const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
  if (error || !data) notFound();
  return new Response(await data.arrayBuffer(), { headers: {
    "Content-Type": parsed.mimeType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
