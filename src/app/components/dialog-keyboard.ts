import type { KeyboardEvent } from "react";

/** Keep Tab inside an open modal, including browsers which otherwise move
 * through browser chrome at the boundary of the native dialog. */
export function containDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
    .filter(node => node.tabIndex >= 0 && node.getClientRects().length > 0 && !node.closest("[hidden],[inert]"))
    .filter((node, index, nodes) => {
      if (!(node instanceof HTMLInputElement) || node.type !== "radio" || !node.name) return true;
      const group = nodes.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.type === "radio" && other.name === node.name);
      return group.some(radio => radio.checked) ? node.checked : nodes.indexOf(group[0]) === index;
    });
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
