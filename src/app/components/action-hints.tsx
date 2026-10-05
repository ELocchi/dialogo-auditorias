"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Hint = { target: HTMLElement; text: string; left: number; top: number; above: boolean };
/** Shared hints for explicitly described actions. Does not invent action names.
 * Keeps the existing layout; hints work on keyboard focus as well as hover. */
export function ActionHints() {
  const id = useId();
  const [hint, setHint] = useState<Hint | null>(null);
  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let oldDescription: string | null = null;
    const hide = () => {
      clearTimeout(timer);
      if (target) {
        if (oldDescription === null) target.removeAttribute("aria-describedby");
        else target.setAttribute("aria-describedby", oldDescription);
      }
      target = null;
      setHint(null);
    };
    const show = (element: HTMLElement) => {
      const text = element.dataset.tooltip?.trim();
      if (!text || element.matches(":disabled")) return;
      clearTimeout(timer);
      if (target !== element) {
        hide(); target = element;
        oldDescription = element.getAttribute("aria-describedby");
        element.setAttribute("aria-describedby", [oldDescription, id].filter(Boolean).join(" "));
      }
      const box = element.getBoundingClientRect();
      const above = box.top > 110;
      setHint({ target: element, text, left: Math.max(148, Math.min(window.innerWidth - 148, box.left + box.width / 2)),
        top: above ? box.top - 8 : box.bottom + 8, above });
    };
    const match = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>("[data-tooltip]") : null;
    const focus = (event: FocusEvent) => { const node = match(event.target); if (node) show(node); else hide(); };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return; // Never intercept the first tap.
      if (event.target instanceof Element && event.target.closest(`#${CSS.escape(id)}`)) { clearTimeout(timer); return; }
      const node = match(event.target); if (node) show(node);
    };
    const out = (event: PointerEvent | FocusEvent) => {
      if (event.relatedTarget instanceof Node && target?.contains(event.relatedTarget)) return;
      timer = setTimeout(() => { if (document.activeElement !== target) hide(); }, 180);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && target) { hide(); event.preventDefault(); event.stopPropagation(); }
    };
    const click = () => hide();
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", out);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("keydown", key, true);
    document.addEventListener("click", click);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    document.documentElement.dataset.actionHintsReady = "true";
    const focused = match(document.activeElement);
    if (focused) show(focused);
    return () => {
      delete document.documentElement.dataset.actionHintsReady;
      clearTimeout(timer);
      if (target) { if (oldDescription === null) target.removeAttribute("aria-describedby"); else target.setAttribute("aria-describedby", oldDescription); }
      document.removeEventListener("focusin", focus); document.removeEventListener("focusout", out);
      document.removeEventListener("pointerover", over); document.removeEventListener("pointerout", out);
      document.removeEventListener("keydown", key, true); document.removeEventListener("click", click);
      window.removeEventListener("resize", hide); window.removeEventListener("scroll", hide, true);
    };
  }, [id]);
  return hint && hint.target.isConnected ? createPortal(<span id={id} role="tooltip" className="action-tooltip"
    style={{ left: hint.left, top: hint.top, transform: `translate(-50%, ${hint.above ? "-100%" : "0"})` }}>{hint.text}</span>, hint.target.closest("dialog") ?? document.body) : null;
}
