import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { purchaseOrderVendorOptions } from "./purchase-orders.js";

export function GrnSupplierPicker({ vendors = [], value = "", onChange, onSelect, id }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const options = useMemo(() => purchaseOrderVendorOptions(vendors, query), [vendors, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [open]);

  function openList() {
    const selected = purchaseOrderVendorOptions(vendors).findIndex((name) => name.toLowerCase() === String(value).toLowerCase());
    setQuery("");
    setActiveIndex(selected >= 0 ? selected : 0);
    setOpen(true);
  }

  function chooseVendor(name) {
    if (!name) return;
    const vendor = vendors.find((entry) => String(entry?.name || entry).trim().toLowerCase() === name.toLowerCase());
    onSelect(vendor && typeof vendor === "object" ? vendor : { name });
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      if (!options.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => index < 0 ? 0 : (index + direction + options.length) % options.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (options.length) chooseVendor(options[activeIndex] || options[0]);
      else setOpen(false);
    }
  }

  return <div className={`grn-supplier-picker${open ? " is-open" : ""}`} ref={rootRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Search className="grn-supplier-search-icon" size={17} aria-hidden="true" />
    <input
      id={id}
      ref={inputRef}
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeIndex >= 0 && options.length ? `${listId}-option-${activeIndex}` : undefined}
      value={open ? query : value}
      placeholder="Type a supplier name"
      required
      onFocus={() => { if (!open) openList(); }}
      onClick={() => { if (!open) openList(); }}
      onChange={(event) => {
        const nextQuery = event.target.value;
        setQuery(nextQuery);
        setActiveIndex(purchaseOrderVendorOptions(vendors, nextQuery).length ? 0 : -1);
        setOpen(true);
        onChange(nextQuery);
      }}
      onKeyDown={handleKeyDown}
    />
    <button type="button" className="grn-supplier-toggle" aria-label="Show suppliers" aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) setOpen(false); else { openList(); inputRef.current?.focus(); } }}><ChevronDown size={17} /></button>
    {open && <div id={listId} className="grn-supplier-options" role="listbox" aria-label="Supplier suggestions">
      <div className="grn-supplier-options-head"><span>{query.trim() ? `Suppliers matching “${query.trim()}”` : "All suppliers"}</span><strong>{options.length}</strong></div>
      {options.map((name, index) => <button id={`${listId}-option-${index}`} key={name.toLowerCase()} type="button" role="option" aria-selected={name.toLowerCase() === String(value).toLowerCase()} data-active={index === activeIndex ? "true" : undefined} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseVendor(name)}>{name}</button>)}
      {!options.length && <span className="grn-supplier-empty">No matching suppliers. You can type a new name.</span>}
    </div>}
  </div>;
}
