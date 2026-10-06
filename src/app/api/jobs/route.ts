import { publicationRequest, headers } from "@/lib/publications/http";
import { jobService } from "@/lib/jobs/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return publicationRequest(request, async (_service, context) => Response.json(await jobService(context).list(), { headers }));
}
