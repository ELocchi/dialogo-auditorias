import { redirect } from "next/navigation";
import { requireAdministrator } from "@/lib/auth/session";

export default async function AdministrationPage() {
  await requireAdministrator();
  redirect("/administracao/usuarios");
}
