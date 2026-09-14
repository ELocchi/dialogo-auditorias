const saoPauloDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  era: "short",
});

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function readMonth(value: string): { year: number; month: number } {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  const year = match ? Number(match[1]) : 0;
  const month = match ? Number(match[2]) : 0;
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError("Mês inválido: use AAAA-MM entre 0001-01 e 9999-12.");
  }
  return { year, month };
}

/** Calendar dates are literal Gregorian days, never instants converted to local time. */
export function isCalendarDate(value: string): boolean {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth(year, month);
}

export function getSaoPauloToday(now: Date = new Date()): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError("Data inválida.");
  const parts = saoPauloDate.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const result = `${value("year").padStart(4, "0")}-${value("month")}-${value("day")}`;
  if (value("era") !== "AD" || !isCalendarDate(result)) throw new RangeError("Data fora dos anos 0001 a 9999.");
  return result;
}

/** Sunday-first weeks contain only dates of this month; padding cells are null. */
export function getCalendarDays(value: string): Array<string | null> {
  const { year, month } = readMonth(value);
  const firstDay = new Date(0);
  // Date.UTC treats years 0–99 as 1900–1999; setUTCFullYear preserves the actual year.
  firstDay.setUTCFullYear(year, month - 1, 1);
  const offset = firstDay.getUTCDay();
  const count = daysInMonth(year, month);
  const cells = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= count ? `${value}-${String(day).padStart(2, "0")}` : null;
  });
}

/** At the supported year boundaries, navigation stays on the current month. */
export function shiftCalendarMonth(value: string, direction: -1 | 1): string {
  const { year, month } = readMonth(value);
  if (direction !== -1 && direction !== 1) throw new RangeError("Direção inválida: use -1 ou 1.");
  const index = Math.max(0, Math.min(9999 * 12 - 1, (year - 1) * 12 + month - 1 + direction));
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}
