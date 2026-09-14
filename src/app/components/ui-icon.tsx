import type { ReactNode } from "react";

export type IconName = "overview" | "audits" | "occurrences" | "works" | "report" | "settings" | "arrow" | "plus" | "calendar" | "info" | "check" | "book" | "bell";
const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  audits: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M8 12l3 3 5-6" /></>,
  occurrences: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  works: <path d="M3 21h18M6 21V5l12-3v19M9 8h1m4-1h1m-6 5h1m4-1h1m-6 5h1m4-1h1M11 21v-3h3v3" />,
  report: <path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8" />,
  settings: <><path d="m9 3-.6 2.1-2 .9-2-.5-2 3.5L4 10.5v3L2.4 15l2 3.5 2-.5 2 .9L9 21h6l.6-2.1 2-.9 2 .5 2-3.5-1.6-1.5v-3L21.6 9l-2-3.5-2 .5-2-.9L15 3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  book: <path d="M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
};
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
