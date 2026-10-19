import React from "react";
import { ReceiptText, CreditCard, BookOpen, ClipboardList, FileBarChart, BadgeIndianRupee } from "lucide-react";
import "./finance-workspace-design.css";

const pages = {
  Receipts: [ReceiptText, "MONEY IN", "Receipts", "A clear record of every collection.", "Review incoming payments, record receipts, and track the accounts they reach."],
  Expenses: [BadgeIndianRupee, "BUSINESS SPENDING", "Expenses", "Keep every expense in view.", "Organize business spending, review payment accounts, and keep your expense records up to date."],
  "Bank Accounts": [CreditCard, "CASH & BANKING", "Bank accounts", "Your accounts, connected.", "Monitor balances and trace money moving in and out of each bank account."],
  "Journal Entries": [ClipboardList, "ACCOUNTING ENTRIES", "Journal entries", "Balanced entries. Clear records.", "Create debit and credit entries, review their status, and find the references you need."],
  "General Ledger": [BookOpen, "ACCOUNT BOOKS", "General ledger", "Follow every account movement.", "Explore your chart of accounts and review posted activity with running balances."],
  "Finance Reports": [FileBarChart, "FINANCIAL OVERVIEW", "Finance reports", "Your finances, at a glance.", "Review receipts, expenses, vendor payments, and journals together in one report."],
};

export function FinancePageIntro({ view }) {
  const page = pages[view];
  if (!page) return null;
  const [Icon, eyebrow, title, heading, description] = page;
  return <header className="finance-page-intro">
    <div className="finance-intro-main"><div className="finance-intro-icon"><Icon size={27} /></div><div><span>{eyebrow}</span><h2>{heading}</h2><p>{description}</p></div></div>
    <div className="finance-intro-label"><span>FINANCE WORKSPACE</span><strong>{title}</strong></div>
  </header>;
}
