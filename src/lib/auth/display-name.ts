export function platformDisplayName(email: string | null | undefined, fallback = "Usuário") {
  const localPart = email?.split("@", 1)[0]?.split("+", 1)[0] ?? "";
  const parts = localPart.split(/[._\-\s]+/u)
    .map((part) => part.replace(/[^\p{L}\p{M}'’]/gu, ""))
    .filter(Boolean);
  const selected = parts.length > 1 ? [parts[0], parts.at(-1)!] : parts;
  const displayName = selected.map((part) => {
    const normalized = part.toLocaleLowerCase("pt-BR");
    return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
  }).join(" ");
  return displayName || fallback.trim() || "Usuário";
}
