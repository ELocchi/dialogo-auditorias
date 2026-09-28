import "server-only";

import { createClient } from "../supabase/server";
import type { requireActiveProfile } from "../auth/session";
import { readSelectedWorkspace } from "./workspace-service";

/** Caller must have a verified current account and a currently granted selection.
 * Read through the user's session/RLS; never a privileged service client.
 */
export async function readWorkspaceContext(active: Awaited<ReturnType<typeof requireActiveProfile>>) {
  try {
    return await readSelectedWorkspace(await createClient(), active);
  } catch { return null; }
}

