// Keep scrolling the page/form instead of stepping a focused numeric field.
// Capture runs before the browser's number-input default action; passive lets
// the same wheel gesture continue scrolling normally.
export function installNumberInputWheelGuard(document) {
  const onWheel = (event) => {
    const input = event.target;
    if (input?.tagName === "INPUT" && input.type === "number"
      && document.activeElement === input && !input.readOnly && !input.disabled) {
      input.blur();
    }
  };
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });
  return () => document.removeEventListener("wheel", onWheel, true);
}
