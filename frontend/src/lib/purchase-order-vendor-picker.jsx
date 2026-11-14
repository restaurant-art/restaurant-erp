import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { purchaseOrderVendorOptions } from "./purchase-orders.js";

export function PurchaseOrderVendorPicker({ vendors = [], value = "", onChange, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const id = useId();
  const options = useMemo(() => purchaseOrderVendorOptions(vendors, query), [vendors, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [open]);

  const openList = () => {
    const selectedIndex = purchaseOrderVendorOptions(vendors).findIndex((name) => name.toLowerCase() === String(value).toLowerCase());
    setQuery("");
    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  };

  const chooseVendor = (name) => {
    if (!name) return;
    onChange(name);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      if (!options.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => current < 0 ? 0 : (current + direction + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      chooseVendor(options[activeIndex] || options[0]);
    }
  };

  return <div className={`purchase-order-vendor-picker${open ? " is-open" : ""}`} ref={rootRef}>
    <Search className="purchase-order-vendor-search-icon" size={17} aria-hidden="true" />
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      autoComplete="off"
      role="combobox"
      aria-label="Vendor"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${id}-listbox`}
      aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      value={open ? query : value}
      placeholder="Type a vendor name"
      required
      onFocus={() => { if (!open) openList(); }}
      onClick={() => { if (!open) openList(); }}
      onChange={(event) => {
        const nextQuery = event.target.value;
        const nextOptions = purchaseOrderVendorOptions(vendors, nextQuery);
        setQuery(nextQuery);
        setOpen(true);
        setActiveIndex(nextOptions.length ? 0 : -1);
      }}
      onKeyDown={handleKeyDown}
    />
    <button type="button" className="purchase-order-vendor-toggle" aria-label="Show vendors" aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) { setOpen(false); setQuery(""); setActiveIndex(-1); } else { openList(); inputRef.current?.focus(); } }}><ChevronDown size={17} /></button>
    {open && <div id={`${id}-listbox`} className="purchase-order-vendor-options" role="listbox" aria-label="Vendor suggestions">
      <div className="purchase-order-vendor-options-head"><span>{query.trim() ? `Vendors matching “${query.trim()}”` : "All vendors"}</span><strong>{options.length}</strong></div>
      {options.map((name, index) => <button id={`${id}-option-${index}`} key={name.toLowerCase()} type="button" role="option" aria-selected={name.toLowerCase() === String(value).toLowerCase()} data-active={index === activeIndex ? "true" : undefined} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseVendor(name)}>{name}</button>)}
      {!options.length && <span className="purchase-order-vendor-empty">No matching vendors</span>}
    </div>}
  </div>;
}
