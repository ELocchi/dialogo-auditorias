export const auditorColorOptions = [
  { name: "Azul-marinho", value: "#1e3a5f" },
  { name: "Vermelho escuro", value: "#dc2626" },
  { name: "Amarelo escuro", value: "#ca8a04" },
  { name: "Verde escuro", value: "#15803d" },
  { name: "Roxo escuro", value: "#7c3aed" },
  { name: "Rosa escuro", value: "#be185d" },
  { name: "Laranja escuro", value: "#ea580c" },
  { name: "Marrom escuro", value: "#78350f" },
  { name: "Azul claro", value: "#60a5fa" },
  { name: "Vermelho claro", value: "#f87171" },
  { name: "Amarelo claro", value: "#facc15" },
  { name: "Verde claro", value: "#4ade80" },
  { name: "Roxo claro", value: "#a78bfa" },
  { name: "Rosa claro", value: "#f472b6" },
  { name: "Laranja claro", value: "#fb923c" },
  { name: "Marrom claro", value: "#b08968" },
  { name: "Preto claro", value: "#475569" },
  { name: "Preto escuro", value: "#111827" },
  { name: "Azul-turquesa claro", value: "#2dd4bf" },
  { name: "Azul-turquesa escuro", value: "#0f766e" },
] as const;

export const auditorColorPalette = auditorColorOptions.map((option) => option.value);

export const validAuditorColor = (value: unknown): value is string =>
  typeof value === "string" && auditorColorPalette.some((color) => color === value.toLowerCase());

/** Works follow their displayed order, using the eight main colors before lighter tones. */
export function assignWorkColors(ids: readonly string[]): Record<string, string> {
  const uniqueIds = [...new Set(ids)];
  return Object.fromEntries(uniqueIds.map((id, index) => [id, auditorColorPalette[index % auditorColorPalette.length]]));
}

/** Auditors follow their displayed order, using the same sequence as works. */
export function assignAuditorColors(ids: readonly string[], preferences: Record<string, string> = {}): Record<string, string> {
  const uniqueIds = [...new Set(ids)];
  const colors: Record<string, string> = {};
  const used = new Set<string>();
  for (const id of uniqueIds) {
    const preferred = preferences[id]?.toLowerCase();
    if (validAuditorColor(preferred) && !used.has(preferred)) {
      colors[id] = preferred;
      used.add(preferred);
    }
  }
  for (const [index, id] of uniqueIds.entries()) {
    if (colors[id]) continue;
    const start = index % auditorColorPalette.length;
    const available = Array.from({ length: auditorColorPalette.length }, (_, offset) => auditorColorPalette[(start + offset) % auditorColorPalette.length])
      .find((color) => !used.has(color));
    // More than 20 simultaneous auditors necessarily reuse one of the fixed colors.
    const color = available ?? auditorColorPalette[start];
    colors[id] = color;
    used.add(color);
  }
  return colors;
}
