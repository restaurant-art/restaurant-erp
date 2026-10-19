import React, { useId, useState } from "react";

export function PurchaseGstSelect({ rates, value, onChange }) {
  // Retain a saved item's rate even if it is no longer in the default list.
  const options = [...new Set([...rates, value]
    .filter((rate) => rate !== null && rate !== undefined && String(rate).trim() !== "")
    .map(Number).filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100))]
    .sort((first, second) => first - second);
  const selected = value === null || value === undefined || String(value).trim() === "" ? "" : String(Number(value));
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selectedIndex = options.findIndex((rate) => String(rate) === selected);

  function openOptions() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(rate) {
    onChange(String(rate));
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(event) {
    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      openOptions();
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setActive((current) => event.key === "ArrowDown"
        ? Math.min(current < 0 ? selectedIndex : current + 1, options.length - 1)
        : Math.max(current < 0 ? selectedIndex : current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const index = active >= 0 ? active : selectedIndex;
      if (options[index] !== undefined) choose(options[index]);
    }
  }

  return <label className="purchase-gst-select"><span>GST %</span>
    <button type="button" className="purchase-gst-trigger" role="combobox" aria-label="GST %"
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
      onClick={() => open ? setOpen(false) : openOptions()} onKeyDown={handleKeyDown} onBlur={() => setOpen(false)}>
      {selected ? `${Number(selected)}%` : "Select GST"}
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="purchase-gst-options" id={`${id}-list`} role="listbox" aria-label="GST rates">
      {options.map((rate, index) => <button key={rate} type="button" role="option" aria-selected={String(rate) === selected}
        className={index === active ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(rate)}>
        {rate}%
      </button>)}
    </div>}
  </label>;
}
