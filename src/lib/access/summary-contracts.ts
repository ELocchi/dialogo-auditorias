export type AccessSummary = {
  available: true;
  pendingCount: number;
  activeCount: number;
} | {
  available: false;
  pendingCount: null;
  activeCount: null;
};

export const unavailableAccessSummary = (): AccessSummary => ({
  available: false, pendingCount: null, activeCount: null,
});

export function isAvailableAccessSummary(value: unknown): value is Extract<AccessSummary, { available: true }> {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<AccessSummary>;
  return summary.available === true && typeof summary.pendingCount === "number"
    && Number.isSafeInteger(summary.pendingCount) && summary.pendingCount >= 0
    && typeof summary.activeCount === "number" && Number.isSafeInteger(summary.activeCount) && summary.activeCount >= 0;
}
