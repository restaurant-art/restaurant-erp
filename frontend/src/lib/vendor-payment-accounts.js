const DEFAULT_VENDOR_PAYMENT_ACCOUNTS = ["Cash", "UPI", "Card"];

export function buildVendorPaymentFundingAccounts(bankAccounts = []) {
  const names = [
    ...DEFAULT_VENDOR_PAYMENT_ACCOUNTS,
    ...bankAccounts
      .filter((account) => String(account?.status || "Active").toLowerCase() !== "inactive")
      .map((account) => String(account?.accountName || "").trim())
      .filter(Boolean),
  ];
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeVendorPaymentFundingAccount(value, accounts) {
  const normalized = String(value || "").trim().toLowerCase();
  return accounts.find((account) => account.toLowerCase() === normalized) || "Cash";
}
