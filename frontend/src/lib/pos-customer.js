export function validateBillCustomer({ name = "", mobile = "", location = "" }) {
  const customer = { name: String(name).trim(), mobile: String(mobile).trim() };
  const cleanedLocation = String(location).trim();
  if (cleanedLocation) customer.location = cleanedLocation;
  const errors = {};
  if (!customer.name && !customer.mobile) errors.name = "Enter a customer name or mobile number.";
  else if (customer.name && customer.name.length < 2) errors.name = "Enter at least 2 characters for the customer name.";
  if (customer.mobile && !/^\d{10}$/.test(customer.mobile)) errors.mobile = "Enter a valid 10-digit mobile number.";
  return { customer, errors, valid: Object.keys(errors).length === 0 };
}

export function searchBillCustomers(customers = [], query = "") {
  const term = String(query).trim().toLocaleLowerCase();
  if (!term) return customers.slice(0, 6);
  const digits = term.replace(/\D/g, "");
  const phoneQueries = new Set([digits]);
  if (digits.startsWith("91") && digits.length > 10) phoneQueries.add(digits.slice(-10));
  return customers.filter((customer) => {
    const nameMatch = String(customer.name || "").toLocaleLowerCase().includes(term);
    const mobile = String(customer.mobile || "").replace(/\D/g, "");
    const mobileMatch = [...phoneQueries].some((phoneQuery) => phoneQuery.length > 0 && mobile.includes(phoneQuery));
    return nameMatch || mobileMatch;
  }).slice(0, 8);
}
