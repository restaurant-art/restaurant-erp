import React, { useEffect, useRef, useState } from "react";
import { Bot, Maximize2, MessageCircleQuestion, Send, Sparkles, Trash2, X } from "lucide-react";
import { useBusinessState } from "./use-business-state.js";
import { answerVestyQuestion } from "./vesty-engine.js";
import "./vesty-assistant.css";

const welcome = (storeName) => ({ id: "welcome", role: "assistant", text: `Hi, I’m Vesty. I can answer questions about ${storeName || "this branch"} and explain how UVPRO ERP & POS works.`, suggestions: ["Today's sales", "Low stock items", "What can you help with?"] });

export function VestyAssistant({ store, salesLedger = [], refundLedger = [], tableOrders = [], kdsOrders = [], menuItems = [], allowedModules = [] }) {
  const storeId = store?.id || "";
  const [inventory] = useBusinessState(`vestora-inventory-${storeId}`, []);
  const [transactions] = useBusinessState(`vestora-inventory-transactions-${storeId}`, []);
  const [vendors] = useBusinessState(`vestora-inventory-vendors-${storeId}`, []);
  const [purchaseDrafts] = useBusinessState(`vestora-purchase-drafts-${storeId}`, []);
  const [vendorPayments] = useBusinessState(`vestora-finance-vendor-payments-${storeId}`, []);
  const [expenses] = useBusinessState(`vestora-finance-expenses-${storeId}`, []);
  const [recipes] = useBusinessState(`vestora-recipes-${storeId}`, []);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState(() => [welcome(store?.name)]);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  useEffect(() => { setMessages([welcome(store?.name)]); }, [storeId]);
  useEffect(() => { if (open) { inputRef.current?.focus(); endRef.current?.scrollIntoView({ block: "end" }); } }, [open, messages.length]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const context = { storeName: [store?.name, store?.branch].filter(Boolean).join(" / "), allowedModules, sales: salesLedger, refunds: refundLedger,
    tableOrders, kdsOrders, menuItems, inventory, transactions, vendors, purchaseDrafts, vendorPayments, expenses, recipes };
  const ask = (text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    const answer = answerVestyQuestion(clean, context);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }, { id: crypto.randomUUID(), role: "assistant", ...answer }]);
    setQuestion("");
  };
  const clear = () => setMessages([welcome(store?.name)]);

  return <div className={`vesty-shell ${open ? "open" : ""} ${expanded ? "expanded" : ""}`}>
    {open && <section id="vesty-assistant-panel" className="vesty-panel" role="dialog" aria-modal="false" aria-label="Vesty assistant">
      <header className="vesty-head"><div className="vesty-avatar"><Bot size={21} /></div><div><strong>Vesty</strong><span><i /> UVPRO assistant · Live branch data</span></div>
        <div className="vesty-head-actions"><button type="button" title="Clear conversation" aria-label="Clear Vesty conversation" onClick={clear}><Trash2 size={15} /></button><button type="button" title={expanded ? "Restore size" : "Expand"} aria-label={expanded ? "Restore Vesty size" : "Expand Vesty"} onClick={() => setExpanded((value) => !value)}><Maximize2 size={15} /></button><button type="button" aria-label="Close Vesty" onClick={() => { setOpen(false); setExpanded(false); }}><X size={17} /></button></div>
      </header>
      <div className="vesty-context"><Sparkles size={14} /><span>Answering for <strong>{[store?.name, store?.branch].filter(Boolean).join(" · ") || "current branch"}</strong></span></div>
      <div className="vesty-messages" aria-live="polite">{messages.map((message) => <article key={message.id} className={`vesty-message ${message.role}`}>
        {message.role === "assistant" && <div className="vesty-mini-avatar"><Bot size={15} /></div>}<div><p>{message.text}</p>{message.suggestions?.length > 0 && <div className="vesty-suggestions">{message.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>}</div>
      </article>)}<div ref={endRef} /></div>
      <form className="vesty-composer" onSubmit={(event) => { event.preventDefault(); ask(question); }}><input ref={inputRef} aria-label="Ask Vesty" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about sales, stock, purchases…" maxLength={300} /><button type="submit" aria-label="Send question" disabled={!question.trim()}><Send size={17} /></button></form>
      <footer>Vesty reads current UVPRO records. Verify decisions in the relevant report.</footer>
    </section>}
    {!open && <button type="button" className="vesty-launcher" aria-label="Open Vesty assistant" aria-controls="vesty-assistant-panel" aria-expanded="false" onClick={() => setOpen(true)}><MessageCircleQuestion size={23} /><span>Ask Vesty</span></button>}
  </div>;
}

