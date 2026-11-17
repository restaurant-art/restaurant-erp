import React, { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { billCustomerTypes } from "./crm-customers.js";

const ranges = [
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const customerId = (bill) => {
  const mobile = String(bill.customerMobile || "").replace(/\D/g, "").slice(-10);
  const name = String(bill.customerName || "").trim();
  return mobile || name.toLowerCase();
};
const billDate = (bill) => {
  const parsed = new Date(bill.createdAt || bill.completedAt || bill.date || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function buildDailyBuckets(count, today) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (count - index - 1));
    return { key: dateKey(date), label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), sales: 0, orders: 0, customers: new Set() };
  });
}

function buildWeeklyBuckets(today) {
  const first = new Date(today);
  first.setDate(first.getDate() - 90);
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index * 7);
    return { key: dateKey(date), start: date, label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), sales: 0, orders: 0, customers: new Set() };
  });
}

function buildMonthlyBuckets(today, firstActivity) {
  const first = firstActivity
    ? new Date(firstActivity.getFullYear(), firstActivity.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const monthCount = Math.max(1, (today.getFullYear() - first.getFullYear()) * 12 + today.getMonth() - first.getMonth() + 1);
  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth() + index, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), sales: 0, orders: 0, customers: new Set() };
  });
}

function CustomerAnalysis({ salesLedger = [] }) {
  const [range, setRange] = useState("30");
  const analysis = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayCount = range === "all" ? null : Number(range);
    const start = dayCount ? new Date(today) : null;
    if (start) start.setDate(start.getDate() - dayCount + 1);

    const identifiedBills = salesLedger
      .map((bill) => ({ bill, id: customerId(bill), date: billDate(bill) }))
      .filter((row) => row.id && row.date);
    const lifetime = new Map();
    identifiedBills.forEach(({ bill, id, date }) => {
      const current = lifetime.get(id) || { id, name: String(bill.customerName || "Customer").trim() || "Customer", mobile: String(bill.customerMobile || "").replace(/\D/g, "").slice(-10), firstVisit: date, spend: 0, visits: 0 };
      if (date < current.firstVisit) current.firstVisit = date;
      current.name = String(bill.customerName || "").trim() || current.name;
      current.mobile = String(bill.customerMobile || "").replace(/\D/g, "").slice(-10) || current.mobile;
      current.spend += Number(bill.total || 0);
      current.visits += 1;
      lifetime.set(id, current);
    });

    const inRange = identifiedBills.filter(({ date }) => !start || date >= start);
    const customers = new Map();
    const popularItems = new Map();
    const types = new Map();
    let identifiedSales = 0;
    inRange.forEach(({ bill, id }) => {
      const summary = customers.get(id) || { id, name: String(bill.customerName || "Customer").trim() || "Customer", mobile: String(bill.customerMobile || "").replace(/\D/g, "").slice(-10), spend: 0, visits: 0 };
      summary.name = String(bill.customerName || "").trim() || summary.name;
      summary.mobile = String(bill.customerMobile || "").replace(/\D/g, "").slice(-10) || summary.mobile;
      summary.spend += Number(bill.total || 0);
      summary.visits += 1;
      customers.set(id, summary);
      identifiedSales += Number(bill.total || 0);
      (bill.items || []).forEach((item) => {
        const name = String(item.name || "").trim();
        if (name) popularItems.set(name, (popularItems.get(name) || 0) + Number(item.qty || 0));
      });
      billCustomerTypes(bill).forEach((type) => types.set(type, (types.get(type) || 0) + 1));
    });

    const repeatCustomers = [...customers.values()].filter((customer) => customer.visits > 1).length;
    const newCustomers = [...lifetime.values()].filter((customer) => !start || customer.firstVisit >= start).length;
    const firstActivity = identifiedBills.reduce((earliest, row) => !earliest || row.date < earliest ? row.date : earliest, null);
    const buckets = range === "all" ? buildMonthlyBuckets(today, firstActivity) : range === "90" ? buildWeeklyBuckets(today) : buildDailyBuckets(dayCount, today);
    const bucketStart = buckets[0]?.start || (range === "all" ? null : start);
    inRange.forEach(({ bill, id, date }) => {
      let index;
      if (range === "all") {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        index = buckets.findIndex((bucket) => bucket.key === key);
      } else if (range === "90") {
        index = Math.floor((date.getTime() - bucketStart.getTime()) / (7 * 86400000));
      } else {
        index = buckets.findIndex((bucket) => bucket.key === dateKey(date));
      }
      if (index < 0 || index >= buckets.length) return;
      buckets[index].sales += Number(bill.total || 0);
      buckets[index].orders += 1;
      buckets[index].customers.add(id);
    });

    return {
      totalCustomers: lifetime.size,
      activeCustomers: customers.size,
      newCustomers,
      repeatCustomers,
      repeatRate: customers.size ? Math.round((repeatCustomers / customers.size) * 100) : 0,
      identifiedSales,
      averageBill: inRange.length ? identifiedSales / inRange.length : 0,
      trend: buckets.map(({ customers: active, ...bucket }) => ({ ...bucket, activeCustomers: active.size })),
      topCustomers: [...customers.values()].sort((a, b) => b.spend - a.spend).slice(0, 6),
      topItems: [...popularItems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, quantity]) => ({ name, quantity })),
      types: [...types.entries()].map(([name, bills]) => ({ name, bills })).sort((a, b) => b.bills - a.bills),
      hasCustomerData: identifiedBills.length > 0,
    };
  }, [salesLedger, range]);

  const rangeLabel = ranges.find((item) => item.id === range)?.label || "Last 30 days";
  return <section className="crm-analysis" aria-label="Customer analysis">
    <div className="crm-analysis-heading">
      <div><span className="design-eyebrow">Customer insights</span><h2>Customer analysis</h2><p>Understand visits, repeat buying, spending, and popular items from bills with a customer name or mobile number.</p></div>
      <label className="crm-analysis-range">Analysis period<select value={range} onChange={(event) => setRange(event.target.value)}>{ranges.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className="crm-analysis-context"><strong>{analysis.totalCustomers.toLocaleString("en-IN")} known customers</strong><span>Showing bill activity for {rangeLabel.toLowerCase()} · Guest bills without customer details are not included.</span></div>
    <div className="crm-analysis-metrics">
      <article><span>Active customers</span><strong>{analysis.activeCustomers.toLocaleString("en-IN")}</strong><small>Customers with a bill in this period</small></article>
      <article><span>New customers</span><strong>{analysis.newCustomers.toLocaleString("en-IN")}</strong><small>First recorded visit in this period</small></article>
      <article><span>Repeat customers</span><strong>{analysis.repeatRate}%</strong><small>{analysis.repeatCustomers.toLocaleString("en-IN")} customers bought more than once</small></article>
      <article><span>Identified customer sales</span><strong>{money(analysis.identifiedSales)}</strong><small>Average bill {money(analysis.averageBill)}</small></article>
    </div>
    {!analysis.hasCustomerData ? <div className="crm-analysis-empty"><strong>No customer purchase history yet</strong><span>Add a customer name or mobile number when completing bills to see customer analysis here.</span></div> : <>
      <div className="crm-analysis-panels">
        <section className="panel crm-analysis-panel crm-analysis-trend">
          <div className="crm-analysis-panel-heading"><div><h3>Customer sales trend</h3><p>Sales and active identified customers per day, week, or month</p><div className="crm-analysis-legend"><span><i className="sales" />Sales</span><span><i className="customers" />Active customers</span></div></div><span>{rangeLabel}</span></div>
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={analysis.trend}>
              <defs><linearGradient id="crm-customer-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22745e" stopOpacity={0.28} /><stop offset="95%" stopColor="#22745e" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--design-border, #d9e4df)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--theme-muted, #61766c)", fontSize: 11 }} dy={8} minTickGap={18} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--theme-muted, #61766c)", fontSize: 11 }} width={52} />
              <YAxis yAxisId="customers" orientation="right" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--theme-muted, #61766c)", fontSize: 11 }} width={35} />
              <Tooltip formatter={(value, name) => [name === "sales" ? money(value) : value, name === "sales" ? "Sales" : "Active customers"]} />
              <Area type="monotone" dataKey="sales" name="sales" stroke="#22745e" fill="url(#crm-customer-sales)" strokeWidth={3} />
              <Area type="monotone" dataKey="activeCustomers" name="activeCustomers" yAxisId="customers" stroke="#c58b34" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </section>
        <section className="panel crm-analysis-panel">
          <div className="crm-analysis-panel-heading"><div><h3>Popular items</h3><p>Quantity bought by identified customers</p></div></div>
          {analysis.topItems.length ? <ResponsiveContainer width="100%" height={270}>
            <BarChart data={analysis.topItems} layout="vertical" margin={{ left: 4, right: 18 }}>
              <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="var(--design-border, #d9e4df)" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--theme-muted, #61766c)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={100} tick={{ fill: "var(--theme-text, #163a30)", fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${value} sold`, "Quantity"]} />
              <Bar dataKey="quantity" fill="#22745e" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer> : <div className="crm-analysis-list-empty">Item quantities are not recorded in these bills.</div>}
        </section>
      </div>
      <div className="crm-analysis-panels crm-analysis-lower-panels">
        <section className="panel crm-analysis-panel">
          <div className="crm-analysis-panel-heading"><div><h3>Top customers</h3><p>Ranked by spend during {rangeLabel.toLowerCase()}</p></div></div>
          <div className="crm-analysis-list">{analysis.topCustomers.length ? analysis.topCustomers.map((customer, index) => <div className="crm-analysis-customer" key={customer.id}><span className="crm-analysis-rank">{index + 1}</span><div><strong>{customer.name}</strong><small>{customer.mobile ? `+91 ${customer.mobile}` : `${customer.visits} ${customer.visits === 1 ? "visit" : "visits"}`}</small></div><span className="crm-analysis-customer-spend"><strong>{money(customer.spend)}</strong><small>{customer.visits} {customer.visits === 1 ? "bill" : "bills"}</small></span></div>) : <div className="crm-analysis-list-empty">No identified customer bills in this period.</div>}</div>
        </section>
        <section className="panel crm-analysis-panel">
          <div className="crm-analysis-panel-heading"><div><h3>Customer purchase types</h3><p>Bills grouped by pricing and order channel</p></div></div>
          <div className="crm-analysis-type-list">{analysis.types.length ? analysis.types.map((type) => <div key={type.name}><span>{type.name}</span><strong>{type.bills.toLocaleString("en-IN")} {type.bills === 1 ? "bill" : "bills"}</strong></div>) : <div className="crm-analysis-list-empty">No identified customer bills in this period.</div>}</div>
        </section>
      </div>
    </>}
  </section>;
}

export { CustomerAnalysis };
