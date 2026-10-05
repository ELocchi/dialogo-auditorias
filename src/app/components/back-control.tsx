import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./back-control.module.css";

type BackLabel = { label: string; tooltip?: string };
type BackButtonProps = BackLabel & Omit<ComponentProps<"button">, "children" | "aria-label" | "title">;
type BackLinkProps = BackLabel & Omit<ComponentProps<typeof Link>, "children" | "aria-label" | "title">;

function BackArrow() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>;
}

export function BackButton({ label, tooltip = label, className = "", type = "button", ...props }: BackButtonProps) {
  return <button {...props} type={type} className={`${styles.control} ${className}`} data-back-control="" aria-label={label} data-tooltip={tooltip}><BackArrow /></button>;
}

export function BackLink({ label, tooltip = label, className = "", ...props }: BackLinkProps) {
  return <Link {...props} className={`${styles.control} ${className}`} data-back-control="" aria-label={label} data-tooltip={tooltip}><BackArrow /></Link>;
}

export function BackHeading({ children }: { children: ReactNode }) {
  return <div className={styles.heading}>{children}</div>;
}
