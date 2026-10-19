import React, { useLayoutEffect, useRef } from "react";
import "./vendor-form-surface.css";

export function VendorFormSurface({ modal, onClose, children }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  // Capture the trigger before the form's autofocus input is mounted.
  if (modal && !openerRef.current) openerRef.current = document.activeElement;

  useLayoutEffect(() => {
    if (!modal) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('input')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
      openerRef.current = null;
    };
  }, [modal]);

  if (!modal) return children;
  return <dialog ref={dialogRef} className="purchase-vendor-dialog" aria-label="Add vendor"
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const fields = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter((field) => field.getClientRects().length > 0);
      const first = fields[0];
      const last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>;
}
