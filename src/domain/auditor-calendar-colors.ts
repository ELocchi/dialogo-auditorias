export const auditorColorOptions = [
  { name: "Azul claro", value: "#60a5fa" },
  { name: "Amarelo claro", value: "#facc15" },
  { name: "Vermelho claro", value: "#f87171" },
  { name: "Verde claro", value: "#4ade80" },
  { name: "Rosa claro", value: "#f472b6" },
  { name: "Azul escuro", value: "#2563eb" },
  { name: "Amarelo escuro", value: "#ca8a04" },
  { name: "Vermelho escuro", value: "#dc2626" },
  { name: "Verde escuro", value: "#15803d" },
  { name: "Rosa escuro", value: "#be185d" },
  { name: "Laranja claro", value: "#fb923c" },
  { name: "Marrom claro", value: "#b08968" },
  { name: "Preto claro", value: "#475569" },
  { name: "Roxo claro", value: "#a78bfa" },
  { name: "Azul-turquesa claro", value: "#2dd4bf" },
  { name: "Laranja escuro", value: "#ea580c" },
  { name: "Marrom escuro", value: "#78350f" },
  { name: "Preto escuro", value: "#111827" },
  { name: "Roxo escuro", value: "#7c3aed" },
  { name: "Azul-turquesa escuro", value: "#0f766e" },
] as const;

export const auditorColorPalette = auditorColorOptions.map((option) => option.value);

export const validAuditorColor = (value: unknown): value is string =>
  typeof value === "string" && auditorColorPalette.some((color) => color === value.toLowerCase());

function hashId(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Stable per-ID defaults, while keeping every visible auditor's color distinct. */
export function assignAuditorColors(ids: readonly string[], preferences: Record<string, string> = {}): Record<string, string> {
  const uniqueIds = [...new Set(ids)].sort();
  const colors: Record<string, string> = {};
  const used = new Set<string>();
  for (const id of uniqueIds) {
    const preferred = preferences[id]?.toLowerCase();
    if (validAuditorColor(preferred) && !used.has(preferred)) {
      colors[id] = preferred;
      used.add(preferred);
    }
  }
  for (const id of uniqueIds) {
    if (colors[id]) continue;
    const start = hashId(id) % auditorColorPalette.length;
    const available = Array.from({ length: auditorColorPalette.length }, (_, offset) => auditorColorPalette[(start + offset) % auditorColorPalette.length])
      .find((color) => !used.has(color));
    // More than 20 simultaneous auditors necessarily reuse one of the fixed colors.
    const color = available ?? auditorColorPalette[start];
    colors[id] = color;
    used.add(color);
  }
  return colors;
}
