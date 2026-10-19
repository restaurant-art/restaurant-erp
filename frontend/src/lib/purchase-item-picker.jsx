import React, { useId, useRef, useState, useEffect } from "react";
import { matchesPurchaseItem, purchaseItemOptions } from "./purchase-batches.js";
import "./purchase-item-picker.css";

export function PurchaseItemPicker({ items, value, batchKey, onSelect, inputRef, lineNumber, allowCreate = true, required = false }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef(null);
  const choices = purchaseItemOptions(items);
  const selected = choices.find((item) => item.itemId === value && item.key === (batchKey || value));
  const selectedItem = items.find((item) => item.id === value);
  const search = query.trim().toLowerCase();
  const matches = search ? choices.filter((item) => matchesPurchaseItem(item, search)) : [];
  const options = allowCreate ? [...matches, { key: "__new__", itemId: "__new__", displayName: "＋ Create new inventory item" }] : matches;
  const expanded = open && Boolean(search);
  const displayValue = selected?.displayName || selectedItem?.name || (value === "__new__" ? "Create new inventory item" : query);

  useEffect(() => {
    if (expanded && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, expanded]);

  function choose(item) {
    if (!item) return;
    onSelect(item.itemId, item);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && search) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
      setActive((current) => event.key === "ArrowDown" ? Math.min(current + 1, options.length - 1) : Math.max(current - 1, 0));
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      choose(options[Math.min(Math.max(active, 0), options.length - 1)]);
    }
  }

  return <div className="purchase-item-combobox">
    <label htmlFor={id}>Inventory item</label>
    <input id={id} ref={inputRef} role="combobox" aria-label={`Inventory item ${lineNumber}`}
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`}
      aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
      autoComplete="off" required={required} placeholder="Type item, batch, SKU or barcode" value={displayValue}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
        setActive(-1);
        if (value) onSelect("");
      }}
      onFocus={(event) => { if (value) event.target.select(); else setOpen(true); }}
      onBlur={() => setOpen(false)} onKeyDown={handleKeyDown} />
    {expanded && <div className="purchase-item-dropdown">
      {!matches.length && <p role="status">{allowCreate ? "No matching items. You can create a new item." : "No matching items. Try a product name, SKU or barcode."}</p>}
      <div ref={listRef} id={`${id}-list`} role="listbox" aria-label="Matching inventory items">
        {options.map((item, index) => <button key={item.key} id={`${id}-option-${index}`} type="button"
          role="option" aria-selected={index === active} tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
          <strong>{item.displayName}</strong>
          {item.itemId !== "__new__" && <>
            <small>SKU {item.sku || "—"} · {Number(item.stock || 0)} {item.unit || ""} {item.sharedStock ? "product stock" : "on hand"}</small>
            {(item.batchBarcode || item.batchMrp !== "") && <small>{item.batchBarcode ? `EAN ${item.batchBarcode}` : "EAN not set"}{item.batchMrp !== "" ? ` · MRP ₹${item.batchMrp}` : ""}</small>}
          </>}
        </button>)}
      </div>
    </div>}
  </div>;
}
