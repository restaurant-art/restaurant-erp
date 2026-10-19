import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./finance-entry-dialog.css";

const dialogs = [];
let previousOverflow = "";
const focusable = node => [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
  .filter(element => element.getClientRects().length && element.type !== "hidden");

// Keep the existing Finance forms and save handlers; only change their presentation.
export function FinanceEntryDialog({ title, onClose, children }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(document.activeElement);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const node = dialogRef.current;
    const opener = openerRef.current;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("finance-dialog-open");
    }
    dialogs.push(node);
    const firstField = () => node.querySelector('input:not(:disabled):not([readonly]), select:not(:disabled), textarea:not(:disabled)') || focusable(node)[0] || node;
    firstField().focus();
    const keydown = event => {
      if (dialogs.at(-1) !== node) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const fields = focusable(node);
      if (!fields.length) { event.preventDefault(); node.focus(); return; }
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0].focus(); }
    };
    const containFocus = event => {
      if (dialogs.at(-1) === node && !node.contains(event.target)) firstField().focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", containFocus);
      dialogs.splice(dialogs.indexOf(node), 1);
      if (!dialogs.length) {
        document.body.style.overflow = previousOverflow;
        document.body.classList.remove("finance-dialog-open");
      }
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className="finance-entry-backdrop">
      <div ref={dialogRef} className="finance-entry-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>{children}</div>
    </div>,
    document.querySelector(".app") || document.body
  );
}
