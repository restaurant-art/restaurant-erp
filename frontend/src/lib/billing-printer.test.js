import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";
import { defaultBillingPrinter, loadBillingPrinter, billingPrintOptions } from "./billing-printer.js";
import { isBusinessKey } from "./business-state.js";

const storage = (values) => ({ getItem: (key) => values[key] ?? null });
const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const billing = { ...defaultBillingPrinter, enabled: true, status: "Connected", name: "Counter", paper: "58mm", copies: 2 };

test("legacy billing choice migrates independently of kitchen paper, copies and automation", () => {
  const legacy = { type: "QZ Tray", name: "Essae PR-55", paper: "80mm", copies: 5, autoPrint: true, autoPrintBill: false };
  const saved = loadBillingPrinter(storage({ "vestora-kot-printer": JSON.stringify(legacy) }), "58mm");
  assert.equal(saved.name, legacy.name);
  assert.equal(saved.paper, "58mm");
  assert.equal(saved.copies, 1);
  assert.equal(saved.autoPrint, false);
  assert.equal(saved.enabled, true);
  saved.name = "Counter";
  assert.equal(legacy.name, "Essae PR-55");
});

test("saved billing choice and disconnect survive reload and later KOT changes", () => {
  const saved = loadBillingPrinter(storage({
    "vestora-billing-printer": JSON.stringify({ ...billing, enabled: false }),
    "vestora-kot-printer": JSON.stringify({ type: "QZ Tray", name: "Kitchen" }),
  }));
  assert.equal(saved.name, "Counter");
  assert.equal(saved.enabled, false);
  assert.equal(saved.status, "Disconnected");
  assert.equal(billingPrintOptions(saved), null);
  assert.equal(isBusinessKey("vestora-billing-printer"), false);
});

test("new and malformed settings default to an unconfigured billing printer", () => {
  assert.deepEqual(loadBillingPrinter(storage({})), defaultBillingPrinter);
  assert.deepEqual(loadBillingPrinter(storage({ "vestora-billing-printer": "broken", "vestora-kot-printer": "[]" })), defaultBillingPrinter);
});

test("older QZ settings retain the previous default of automatic billing", () => {
  const saved = loadBillingPrinter(storage({ "vestora-kot-printer": JSON.stringify({ type: "QZ Tray", name: "Counter" }) }));
  assert.equal(saved.autoPrint, true);
});

test("billing reconnects after reload with its own paper and copies", () => {
  const saved = loadBillingPrinter(storage({ "vestora-billing-printer": JSON.stringify(billing) }));
  assert.deepEqual(billingPrintOptions(saved), { printerName: "Counter", paper: "58mm", copies: 2 });
});

function extractFunction(name) {
  const start = source.indexOf(`  async function ${name}(`);
  assert.ok(start > 0);
  return source.slice(start, source.indexOf("\n  }", start) + 4);
}

for (const [name, selector] of [["printCompletedBill", ".completed-print-receipt"], ["reprintHistoryBill", ".history-print-receipt"]]) {
  test(`${name} sends the bill to the billing printer and respects disconnect`, async () => {
    const calls = [], fallbacks = [];
    const context = vm.createContext({
      billingPrinter: billing, kotPrinter: { ...billing, name: "Kitchen" }, billingPrintOptions,
      completedBill: { id: "test" }, selectedHistoryBill: { id: "old" },
      printReceiptWithQz: async (options) => calls.push(options), notify: () => {},
      openSystemPrintDialog: (...args) => fallbacks.push(args),
    });
    vm.runInContext(extractFunction(name), context);
    await context[name]();
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ printerName: "Counter", paper: "58mm", copies: 2, selector }]);
    context.billingPrinter = { ...billing, enabled: false };
    await context[name]();
    assert.equal(calls.length, 1);
    assert.equal(fallbacks.length, 1);
  });
}

const setupStart = source.indexOf("function PrinterConnectionSetup(");
const setupSource = source.slice(setupStart, source.indexOf("\nfunction buildSettingsDefaults", setupStart));
const { code: setupCode } = await transformWithEsbuild(setupSource, "printer-setup.jsx", { loader: "jsx", jsx: "transform" });
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: "fragment" };
const nodes = (tree) => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.children || []).flatMap((child) => Array.isArray(child) ? child.flatMap(nodes) : nodes(child))];
const label = (tree) => typeof tree === "string" ? tree : tree?.children?.map(label).join("") || "";

test("automatic paid bill printing uses the billing route once and honors its own toggle", async () => {
  const start = source.indexOf("  useEffect(() => {\n    if (!billingPrintOptions");
  const end = source.indexOf("\n\n  const filtered", start);
  assert.ok(start > 0 && end > start);
  const calls = [], timers = [];
  let effect;
  const context = vm.createContext({
    billingPrinter: billing, completedBill: { id: "paid-test" }, billingPrintOptions,
    autoPrintedBillRef: { current: "" }, notify: () => {},
    printReceiptWithQz: async (options) => calls.push(options),
    openSystemPrintDialog: () => assert.fail("No system dialog expected"),
    useEffect: (callback) => { effect = callback; },
    window: { setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout: () => {} },
  });
  vm.runInContext(source.slice(start, end), context);
  effect();
  await timers.shift()();
  assert.equal(calls[0].printerName, "Counter");
  assert.equal(calls[0].copies, 2);
  effect();
  assert.equal(timers.length, 0);
  context.completedBill = { id: "next-paid-test" };
  context.billingPrinter = { ...billing, autoPrint: false };
  effect();
  assert.equal(timers.length, 0);
});

test("billing settings connect, test and disconnect independently of the shared QZ session", async () => {
  let printer = { ...defaultBillingPrinter };
  const printed = [], notices = [];
  const context = vm.createContext({
    React, useState: (value) => [value, () => {}], printerChoices: [],
    connectQzTray: async () => ["Counter", "Kitchen"],
    preferredQzPrinter: async () => "Counter", billingPrintOptions,
    printReceiptWithQz: async (options) => printed.push(options),
    printKotWithQz: async () => assert.fail("Billing must not print a KOT"),
  });
  vm.runInContext(setupCode, context);
  const render = () => context.PrinterConnectionSetup({ purpose: "billing", printer, setPrinter: (update) => { printer = update(printer); }, canManage: true, notify: (message) => notices.push(message) });
  const button = (text) => nodes(render()).find((node) => node.type === "button" && label(node) === text);
  await button("Connect printer").props.onClick();
  assert.equal(printer.name, "Counter");
  assert.equal(printer.enabled, true);
  const paper = nodes(render()).find((node) => node.type === "select" && node.props.value === "80mm");
  paper.props.onChange({ target: { value: "58mm" } });
  assert.equal(printer.enabled, true);
  await button("Test bill").props.onClick();
  assert.equal(printed[0].printerName, "Counter");
  assert.equal(printed[0].paper, "58mm");
  assert.equal(printed[0].selector, ".billing-test-receipt");
  await button("Disconnect").props.onClick();
  assert.equal(printer.enabled, false);
  assert.ok(notices.includes("Billing printer disconnected"));
});

test("kitchen settings still test KOT tickets and have no customer bill toggle", async () => {
  const printed = [];
  const context = vm.createContext({ React, useState: (value) => [value, () => {}], printerChoices: [], printKotWithQz: async (options) => printed.push(options) });
  vm.runInContext(setupCode, context);
  const tree = context.PrinterConnectionSetup({ purpose: "kot", printer: { ...billing, name: "Kitchen" }, setPrinter: () => {}, canManage: true, notify: () => {} });
  await nodes(tree).find((node) => node.type === "button" && label(node) === "Test KOT").props.onClick();
  assert.equal(printed[0].printerName, "Kitchen");
  assert.equal(printed[0].isTest, true);
  assert.ok(!label(tree).includes("Auto print customer bill"));
});
