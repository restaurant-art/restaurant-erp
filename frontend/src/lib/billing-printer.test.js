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

test("existing and legacy automatic billing preferences become click-to-print", () => {
  const legacy = loadBillingPrinter(storage({ "vestora-kot-printer": JSON.stringify({ type: "QZ Tray", name: "Counter", autoPrintBill: true }) }));
  const saved = loadBillingPrinter(storage({ "vestora-billing-printer": JSON.stringify({ ...billing, autoPrint: true }) }));
  assert.equal(legacy.autoPrint, false);
  assert.equal(saved.autoPrint, false);
  assert.equal(saved.name, "Counter");
  assert.equal(saved.enabled, true);
});

test("billing reconnects after reload with its own paper and copies", () => {
  const saved = loadBillingPrinter(storage({ "vestora-billing-printer": JSON.stringify(billing) }));
  assert.deepEqual(billingPrintOptions(saved), { printerName: "Counter", paper: "58mm", copies: 2 });
});

test("explicit confirmed-UPI printing preference survives reload without enabling legacy automation", () => {
  const saved = loadBillingPrinter(storage({ "vestora-billing-printer": JSON.stringify({ ...billing, autoPrintUpi: true }) }));
  assert.equal(saved.autoPrintUpi, true);
  assert.equal(saved.autoPrint, false);
  const malformed = loadBillingPrinter(storage({ "vestora-billing-printer": JSON.stringify({ ...billing, autoPrintUpi: "false" }) }));
  assert.equal(malformed.autoPrintUpi, false);
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
      training: false,
      billingPrinter: billing, kotPrinter: { ...billing, name: "Kitchen" }, billingPrintOptions,
      completedBill: { id: "test" }, selectedHistoryBill: { id: "old" },
      printReceiptWithQz: async (options) => calls.push(options), notify: () => {},
      sendWhatsAppBillReceipt: async () => {}, window: { confirm: () => true },
      openSystemPrintDialog: (...args) => fallbacks.push(args),
    });
    vm.runInContext(extractFunction(name), context);
    await context[name]();
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ printerName: "Counter", paper: "58mm", copies: 2, selector }]);
    context.billingPrinter = { ...billing, enabled: false };
    await context[name]();
    assert.equal(calls.length, 1);
    assert.equal(fallbacks.length, 1);
    context.training = true;
    context.billingPrinter = billing;
    await context[name]();
    assert.equal(calls.length, 1, "Training must never send a bill to the live printer");
    assert.equal(fallbacks.length, 2, "Training may open a marked print preview");
  });
}

test("printing a completed bill does not send a duplicate WhatsApp receipt", async () => {
  const sends = [], dialogs = [];
  const context = vm.createContext({
    training: false, billingPrinter: billing, billingPrintOptions,
    completedBill: { id: "bill-1", customerMobile: "9876543210" },
    printReceiptWithQz: async () => {}, notify: () => {},
    sendWhatsAppBillReceipt: async (bill) => sends.push(bill.id),
    openSystemPrintDialog: (...args) => dialogs.push(args),
    window: { confirm: () => true },
  });
  vm.runInContext(extractFunction("printCompletedBill"), context);
  await context.printCompletedBill();
  assert.deepEqual(sends, []);
  context.billingPrinter = { ...billing, enabled: false };
  await context.printCompletedBill();
  assert.equal(sends.length, 0, "Opening the print dialog must not send");
  context.training = true;
  await context.printCompletedBill();
  assert.equal(sends.length, 0, "Training bills must never send a live receipt");
});

const setupStart = source.indexOf("function PrinterConnectionSetup(");
const setupSource = source.slice(setupStart, source.indexOf("\nfunction buildSettingsDefaults", setupStart));
const { code: setupCode } = await transformWithEsbuild(setupSource, "printer-setup.jsx", { loader: "jsx", jsx: "transform" });
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: "fragment" };
const printerIcons = Object.fromEntries(["Printer", "ReceiptText", "ShieldCheck", "Search", "KeyRound", "Store"].map(name => [name, "svg"]));
const nodes = (tree) => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.children || []).flatMap((child) => Array.isArray(child) ? child.flatMap(nodes) : nodes(child))];
const label = (tree) => typeof tree === "string" ? tree : tree?.children?.map(label).join("") || "";

test("billing settings offer automatic printing only for confirmed Pine Labs UPI", () => {
  const context = vm.createContext({ React, ...printerIcons, useEffect: () => {}, useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], printerChoices: [] });
  vm.runInContext(setupCode, context);
  const tree = context.PrinterConnectionSetup({ purpose: "billing", printer: { ...billing, autoPrint: true }, setPrinter: () => {}, canManage: true, notify: () => {} });
  assert.ok(label(tree).includes("Auto print after confirmed Pine Labs UPI payment"));
  assert.equal(nodes(tree).filter((node) => node.type === "input" && node.props.type === "checkbox").length, 1);
});

test("billing settings connect, test and disconnect independently of the shared QZ session", async () => {
  let printer = { ...defaultBillingPrinter };
  const printed = [], notices = [];
  const context = vm.createContext({
    React, ...printerIcons, useEffect: () => {}, useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], printerChoices: [],
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
  const context = vm.createContext({ React, ...printerIcons, useEffect: () => {}, useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], printerChoices: [], printKotWithQz: async (options) => printed.push(options) });
  vm.runInContext(setupCode, context);
  const tree = context.PrinterConnectionSetup({ purpose: "kot", printer: { ...billing, name: "Kitchen" }, setPrinter: () => {}, canManage: true, notify: () => {} });
  await nodes(tree).find((node) => node.type === "button" && label(node) === "Test KOT").props.onClick();
  assert.equal(printed[0].printerName, "Kitchen");
  assert.equal(printed[0].isTest, true);
  assert.ok(!label(tree).includes("Auto print customer bill"));
});
