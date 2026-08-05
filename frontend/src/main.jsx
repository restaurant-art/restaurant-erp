import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeIndianRupee,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Camera,
  CalendarClock,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  CreditCard,
  DatabaseZap,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileBarChart,
  Gauge,
  GripVertical,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Minus,
  Moon,
  PackageSearch,
  PanelLeftClose,
  Pencil,
  Percent,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Table2,
  Truck,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import "./styles.css";

const appBaseUrl = import.meta.env.BASE_URL || "/";

function publicAssetPath(path) {
  const cleanBase = appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`;
  const cleanPath = String(path).replace(/^\/+/, "");
  return `${cleanBase}${cleanPath}`;
}

const vestoraLogoPath = publicAssetPath("vestora-mark.png");

const modules = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "POS Billing", icon: ShoppingCart },
  { id: "kds", label: "KDS", icon: ChefHat },
  { id: "tables", label: "Tables", icon: Table2 },
  { id: "menu", label: "Menu", icon: ClipboardList },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "production", label: "Production", icon: DatabaseZap },
  { id: "crm", label: "CRM", icon: Users },
  { id: "attendance", label: "Attendance", icon: Camera },
  { id: "finance", label: "Finance", icon: BadgeIndianRupee },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "admin", label: "Admin", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

const menuItems = [
  { id: 1, name: "Paneer Tikka Bowl", category: "Mains", price: 249, tax: 5, fav: true, barcode: "890100100001" },
  { id: 2, name: "Hyderabadi Biryani", category: "Mains", price: 329, tax: 5, fav: true, barcode: "890100100002" },
  { id: 3, name: "Tandoori Platter", category: "Mains", price: 429, tax: 5, barcode: "890100100003" },
  { id: 4, name: "Masala Chaas", category: "Beverages", price: 79, tax: 5, barcode: "890100100004" },
  { id: 5, name: "Filter Coffee", category: "Beverages", price: 99, tax: 5, barcode: "890100100005" },
  { id: 6, name: "Gulab Jamun", category: "Dessert", price: 119, tax: 5, barcode: "890100100006" },
];

const menuItemPhotos = {
  "paneer tikka bowl": publicAssetPath("menu/paneer-tikka-bowl.jpg"),
  "hyderabadi biryani": publicAssetPath("menu/hyderabadi-biryani.jpg"),
  "tandoori platter": publicAssetPath("menu/tandoori-platter.jpg"),
  "masala chaas": publicAssetPath("menu/masala-chaas.jpg"),
  "filter coffee": publicAssetPath("menu/filter-coffee.jpg"),
  "gulab jamun": publicAssetPath("menu/gulab-jamun.jpg"),
};

function getMenuItemPhoto(item) {
  if (item.image) return item.image;
  const name = String(item.name || "").trim().toLowerCase();
  if (menuItemPhotos[name]) return menuItemPhotos[name];
  const category = String(item.category || "").toLowerCase();
  if (category.includes("beverage")) return menuItemPhotos["filter coffee"];
  if (category.includes("dessert")) return menuItemPhotos["gulab jamun"];
  return menuItemPhotos["paneer tikka bowl"];
}

const salesGraph = [
  { day: "Mon", sales: 42000, orders: 128 },
  { day: "Tue", sales: 51500, orders: 142 },
  { day: "Wed", sales: 48600, orders: 136 },
  { day: "Thu", sales: 62200, orders: 166 },
  { day: "Fri", sales: 78300, orders: 211 },
  { day: "Sat", sales: 104500, orders: 296 },
  { day: "Sun", sales: 91300, orders: 251 },
];

const reports = [
  "Daily sales",
  "Hourly sales",
  "GST",
  "Item-wise sales",
  "Inventory valuation",
  "Food cost analysis",
  "Menu profitability",
  "Payroll",
  "Cashier closing",
  "Void and refund",
  "Branch comparison",
  "Supplier outstanding",
];

const initialTables = [
  { id: 1, name: "T1", floor: "Main", status: "Available", seats: 2 },
  { id: 2, name: "T2", floor: "Main", status: "Occupied", seats: 4 },
  { id: 3, name: "T3", floor: "Main", status: "Reserved", seats: 6 },
  { id: 4, name: "T4", floor: "Main", status: "Cleaning", seats: 4 },
  { id: 5, name: "T5", floor: "Patio", status: "Billing pending", seats: 4 },
  { id: 6, name: "T6", floor: "Patio", status: "Available", seats: 2 },
  { id: 7, name: "B1", floor: "Banquet", status: "Occupied", seats: 8 },
  { id: 8, name: "B2", floor: "Banquet", status: "Available", seats: 10 },
];

const floorOptions = ["Main", "Patio", "Banquet"];
const tableStatuses = ["Available", "Occupied", "Reserved", "Cleaning", "Billing pending"];

const defaultProductionBatches = [
  { id: "PROD-001", item: "Hyderabadi Biryani", batch: "BIR-01", plannedQty: 40, preparedQty: 28, unit: "plates", rawMaterial: "Basmati Rice", wastage: 1.2, status: "In production", preparedBy: "Kitchen Lead", date: "2026-07-04" },
  { id: "PROD-002", item: "Paneer Tikka Bowl", batch: "PAN-01", plannedQty: 35, preparedQty: 35, unit: "plates", rawMaterial: "Paneer", wastage: 0.6, status: "Completed", preparedBy: "Chef", date: "2026-07-04" },
  { id: "PROD-003", item: "Filter Coffee", batch: "COF-01", plannedQty: 60, preparedQty: 18, unit: "cups", rawMaterial: "Coffee Beans", wastage: 0.1, status: "Planned", preparedBy: "Counter One", date: "2026-07-04" },
];

const productionCategories = ["Main Course", "Snacks", "Juice", "Tea", "Coffee", "Dessert", "Bakery", "Combo Meals", "Beverages", "Production Items", "Semi Finished Items"];
const productionReportNames = ["Daily Production", "Ingredient Consumption", "Food Cost Report", "Wastage Report", "Finished Goods Stock"];
const productionUnits = ["g", "kg", "mg", "litre", "ml", "piece", "dozen", "packet", "bottle", "can", "tray", "box", "cup", "spoon", "tablespoon", "teaspoon", "bundle", "cylinder"];
const productionOutputUnits = ["plate", "plates", "portion", "serving", ...productionUnits];
const productionPortionOptions = ["Full", "Half", "Full plate", "Half plate", "Quarter plate", "Family pack", "Bowl", "Cup", "Glass", "Piece", "Serving"];
const weightUnits = { mg: 0.001, g: 1, kg: 1000 };
const volumeUnits = { ml: 1, litre: 1000 };
const countUnits = { piece: 1, packet: 1, bottle: 1, can: 1, tray: 1, box: 1, cup: 1, spoon: 1, tablespoon: 1, teaspoon: 1, dozen: 12, bundle: 1, cylinder: 1 };
const defaultProductionInventory = [
  { id: "ING-001", name: "Basmati Rice", stock: 48, unit: "kg", reorder: 25, cost: 72 },
  { id: "ING-002", name: "Chicken", stock: 36, unit: "kg", reorder: 18, cost: 344 },
  { id: "ING-003", name: "Biryani Masala", stock: 4.5, unit: "kg", reorder: 3, cost: 620 },
  { id: "ING-004", name: "Onion", stock: 22, unit: "kg", reorder: 15, cost: 38 },
  { id: "ING-005", name: "Tomato", stock: 18, unit: "kg", reorder: 12, cost: 42 },
  { id: "ING-006", name: "Curd", stock: 12, unit: "kg", reorder: 8, cost: 96 },
  { id: "ING-007", name: "Ginger Garlic Paste", stock: 5, unit: "kg", reorder: 3, cost: 160 },
  { id: "ING-008", name: "Ghee", stock: 8, unit: "litre", reorder: 4, cost: 540 },
  { id: "ING-009", name: "Cooking Oil", stock: 18, unit: "litre", reorder: 10, cost: 138 },
  { id: "ING-010", name: "Mint Leaves", stock: 2, unit: "kg", reorder: 1, cost: 180 },
  { id: "ING-011", name: "Coriander Leaves", stock: 2.5, unit: "kg", reorder: 1, cost: 130 },
  { id: "ING-012", name: "Green Chilli", stock: 3, unit: "kg", reorder: 1, cost: 95 },
  { id: "ING-013", name: "Lemon Juice", stock: 5, unit: "litre", reorder: 2, cost: 90 },
  { id: "ING-014", name: "Salt", stock: 10, unit: "kg", reorder: 3, cost: 18 },
  { id: "ING-015", name: "Packaging Box", stock: 350, unit: "piece", reorder: 150, cost: 3 },
];
const defaultInventoryItems = [
  { id: "INV-001", name: "Basmati Rice", sku: "RAW-RICE-01", category: "Dry goods", stock: 18.5, unit: "kg", reorder: 25, cost: 72 },
  { id: "INV-002", name: "Paneer", sku: "RAW-DAIRY-01", category: "Dairy", stock: 34, unit: "kg", reorder: 20, cost: 320 },
  { id: "INV-003", name: "Cooking Gas", sku: "OPS-GAS-01", category: "Operations", stock: 3, unit: "cyl", reorder: 4, cost: 1150 },
  { id: "INV-004", name: "Coffee Beans", sku: "RAW-COFFEE-01", category: "Beverages", stock: 11, unit: "kg", reorder: 6, cost: 680 },
];
const defaultRecipes = [
  {
    id: "REC-001",
    name: "Chicken Biryani",
    category: "Main Course",
    portion: "Full plate",
    outputQty: 1,
    outputUnit: "plate",
    sellingPrice: 180,
    version: 1,
    changedBy: "VESTORA Super Admin",
    changedAt: "2026-07-04",
    ingredients: [
      { name: "Basmati Rice", qty: 250, unit: "g" },
      { name: "Chicken", qty: 180, unit: "g" },
      { name: "Biryani Masala", qty: 10, unit: "g" },
      { name: "Onion", qty: 40, unit: "g" },
      { name: "Tomato", qty: 30, unit: "g" },
      { name: "Curd", qty: 25, unit: "g" },
      { name: "Ginger Garlic Paste", qty: 15, unit: "g" },
      { name: "Ghee", qty: 12, unit: "ml" },
      { name: "Cooking Oil", qty: 18, unit: "ml" },
      { name: "Mint Leaves", qty: 5, unit: "g" },
      { name: "Coriander Leaves", qty: 5, unit: "g" },
      { name: "Green Chilli", qty: 5, unit: "g" },
      { name: "Lemon Juice", qty: 8, unit: "ml" },
      { name: "Salt", qty: 5, unit: "g" },
      { name: "Packaging Box", qty: 1, unit: "piece" },
    ],
  },
  {
    id: "REC-002",
    name: "Filter Coffee",
    category: "Coffee",
    portion: "Cup",
    outputQty: 1,
    outputUnit: "cup",
    sellingPrice: 99,
    version: 1,
    changedBy: "Kitchen Lead",
    changedAt: "2026-07-04",
    ingredients: [
      { name: "Coffee Beans", qty: 18, unit: "g" },
      { name: "Milk", qty: 120, unit: "ml" },
      { name: "Sugar", qty: 8, unit: "g" },
    ],
  },
];

const defaultStores = [
  { id: "STORE-001", name: "Demo Spice House", branch: "Indiranagar", owner: "Restaurant Admin", status: "Active" },
  { id: "STORE-002", name: "Demo Spice House", branch: "Koramangala", owner: "Branch Manager", status: "Active" },
];

const menuSectionConfig = {
  Categories: {
    columns: ["Category", "Code", "Status"],
    fields: [["name", "Category"], ["code", "Code"], ["status", "Status"]],
    sample: { name: "Mains", code: "MAIN", status: "Active" },
    rows: [
      { id: 1, name: "Mains", code: "MAIN", status: "Active" },
      { id: 2, name: "Beverages", code: "BEV", status: "Active" },
      { id: 3, name: "Dessert", code: "DES", status: "Active" },
    ],
  },
  Subcategories: {
    columns: ["Subcategory", "Category", "Status"],
    fields: [["name", "Subcategory"], ["category", "Category"], ["status", "Status"]],
    sample: { name: "Indian mains", category: "Mains", status: "Active" },
    rows: [
      { id: 1, name: "Indian mains", category: "Mains", status: "Active" },
      { id: 2, name: "Hot drinks", category: "Beverages", status: "Active" },
    ],
  },
  Variants: {
    columns: ["Item", "Variant", "Price change"],
    fields: [["item", "Item"], ["variant", "Variant"], ["price", "Price change"]],
    sample: { item: "Hyderabadi Biryani", variant: "Full", price: "80" },
    rows: [
      { id: 1, item: "Hyderabadi Biryani", variant: "Half", price: "0" },
      { id: 2, item: "Hyderabadi Biryani", variant: "Full", price: "80" },
    ],
  },
  Modifiers: {
    columns: ["Modifier", "Price", "Kitchen note"],
    fields: [["name", "Modifier"], ["price", "Price"], ["note", "Kitchen note"]],
    sample: { name: "Extra spicy", price: "0", note: "Print on KOT" },
    rows: [
      { id: 1, name: "Extra cheese", price: "40", note: "Print on KOT" },
      { id: 2, name: "No onion", price: "0", note: "Print on KOT" },
    ],
  },
  Combos: {
    columns: ["Combo", "Items", "Price"],
    fields: [["name", "Combo"], ["items", "Items"], ["price", "Price"]],
    sample: { name: "Lunch combo", items: "Biryani + Chaas", price: "379" },
    rows: [
      { id: 1, name: "Lunch combo", items: "Biryani + Chaas", price: "379" },
      { id: 2, name: "Dessert combo", items: "Coffee + Gulab Jamun", price: "189" },
    ],
  },
  "Printer mapping": {
    columns: ["Section", "Printer", "KOT routing"],
    fields: [["section", "Section"], ["printer", "Printer"], ["routing", "KOT routing"]],
    sample: { section: "Mains", printer: "Kitchen printer", routing: "Kitchen KOT" },
    rows: [
      { id: 1, section: "Mains", printer: "Kitchen printer", routing: "Kitchen KOT" },
      { id: 2, section: "Beverages", printer: "Counter printer", routing: "Bar KOT" },
    ],
  },
  "Nutritional info": {
    columns: ["Item", "Calories", "Allergens"],
    fields: [["item", "Item"], ["calories", "Calories"], ["allergens", "Allergens"]],
    sample: { item: "Paneer Tikka Bowl", calories: "520", allergens: "Milk" },
    rows: [
      { id: 1, item: "Paneer Tikka Bowl", calories: "520", allergens: "Milk" },
      { id: 2, item: "Filter Coffee", calories: "90", allergens: "Milk" },
    ],
  },
};

const settingsSectionConfig = {
  "Restaurant profile": {
    description: "Business identity shown on bills, reports, and admin screens.",
    action: "Verify profile",
    fields: [["restaurantName", "Restaurant name"], ["legalName", "Legal name"], ["phone", "Phone"], ["email", "Email"]],
    defaults: { restaurantName: "Demo Spice House", legalName: "Demo Spice House Pvt Ltd", phone: "+91 98888 11111", email: "admin@demospice.test" },
  },
  "Branch settings": {
    description: "Branch address, counter code, and operating hours.",
    action: "Save branch",
    fields: [["branchName", "Branch name"], ["address", "Address"], ["counterCode", "Counter code"], ["hours", "Opening hours"]],
    defaults: { branchName: "Indiranagar", address: "12, 100 Feet Road, Bengaluru", counterCode: "IND-POS-01", hours: "10:00 AM - 11:30 PM" },
  },
  "GST and FSSAI": {
    description: "Tax and food licence details used on invoices.",
    action: "Verify GST",
    fields: [["gst", "GST number"], ["fssai", "FSSAI number"], ["taxMode", "Tax mode"], ["invoicePrefix", "Invoice prefix"]],
    defaults: { gst: "27ABCDE1234F1Z5", fssai: "10019064001234", taxMode: "Inclusive GST", invoicePrefix: "VST" },
  },
  "Print bill format": {
    description: "Receipt header, footer, logo, and paper defaults.",
    action: "Preview bill",
    fields: [["header", "Bill header"], ["footer", "Footer message"], ["paper", "Paper size"], ["showLogo", "Logo setting"]],
    defaults: { header: "Demo Spice House", footer: "Thank you. Visit again.", paper: "80mm", showLogo: "Logo enabled" },
  },
  "Printer setup": {
    description: "Billing, KOT, and counter printer routing.",
    action: "Test printer",
    fields: [["billPrinter", "Bill printer"], ["kotPrinter", "KOT printer"], ["counterPrinter", "Counter printer"], ["routing", "Routing mode"]],
    defaults: { billPrinter: "Front counter printer", kotPrinter: "Kitchen KOT Printer", counterPrinter: "Windows default printer", routing: "Category wise" },
  },
  "Payment providers": {
    description: "UPI, card, wallet, and payment terminal settings.",
    action: "Test payment",
    fields: [["upiId", "UPI ID"], ["terminal", "Card terminal"], ["wallets", "Wallets"], ["settlement", "Settlement account"]],
    defaults: { upiId: "vestora@upi", terminal: "PineLabs Counter 1", wallets: "Paytm, PhonePe, GPay", settlement: "HDFC Current Account" },
  },
  "Cloudflare R2": {
    description: "Cloud backup storage for bills, reports, and uploads.",
    action: "Test R2",
    fields: [["bucket", "Bucket"], ["endpoint", "Endpoint"], ["accessKey", "Access key"], ["backupPath", "Backup path"]],
    defaults: { bucket: "vestora-backups", endpoint: "https://r2.cloudflare.com", accessKey: "Configured", backupPath: "/demo-spice/indiranagar" },
  },
  "WhatsApp templates": {
    description: "Customer bill, order ready, and campaign messages.",
    action: "Send test",
    fields: [["billTemplate", "Bill template"], ["orderTemplate", "Order ready template"], ["sender", "Sender number"], ["language", "Language"]],
    defaults: { billTemplate: "Your Vestora bill is ready", orderTemplate: "Your order is ready", sender: "+91 90000 11111", language: "English" },
  },
  "Backup policy": {
    description: "Automatic local and cloud backup schedule.",
    action: "Run backup",
    fields: [["frequency", "Frequency"], ["time", "Backup time"], ["retention", "Retention"], ["destination", "Destination"]],
    defaults: { frequency: "Daily", time: "12:30 AM", retention: "90 days", destination: "Local + Cloudflare R2" },
  },
  "Theme and language": {
    description: "Display mode, custom website colors, default language, and currency preferences.",
    action: "Apply theme",
    fields: [["theme", "Display mode"], ["themePreset", "Theme preset"], ["primaryColor", "Primary color"], ["accentColor", "Accent color"], ["sidebarColor", "Sidebar color"], ["backgroundColor", "Page background"], ["surfaceColor", "Card surface"], ["textColor", "Text color"], ["mutedColor", "Muted text"], ["language", "Language"], ["currency", "Currency"], ["timezone", "Timezone"]],
    defaults: { theme: "Light", themePreset: "Emerald", primaryColor: "#17604b", accentColor: "#c28a3a", sidebarColor: "#10231f", backgroundColor: "#f7f8f5", surfaceColor: "#ffffff", textColor: "#10231f", mutedColor: "#60736a", language: "English", currency: "INR", timezone: "Asia/Kolkata" },
  },
};

const storeSettingsSections = [
  "GST and FSSAI",
  "Print bill format",
  "Printer setup",
  "Payment providers",
  "Theme and language",
];

const printerChoices = [
  "BPOS RP-260IV",
  "BPOS RP-260IV Receipt Printer",
  "Front counter printer",
  "Kitchen KOT Printer",
  "Windows default printer",
];

const demoAccounts = [
  { email: "super@vestora.test", password: "Super@123", name: "VESTORA Super Admin", role: "super_admin", appRole: "Super Admin", storeId: "GLOBAL" },
  { email: "admin@vestora.test", password: "Admin@123", name: "Restaurant Admin", role: "restaurant_admin", appRole: "Restaurant Admin", storeId: "STORE-001" },
];

const supplierAccounts = [
  { id: "SUP-001", email: "supplier@freshfarm.test", mobile: "9876543210", password: "Supplier@123", otp: "123456", name: "Fresh Farm Supplies", role: "supplier" },
];

const initialSupplierOrders = [
  {
    id: "PO-24071",
    supplierId: "SUP-001",
    restaurant: "Demo Spice House",
    branch: "Indiranagar",
    orderDate: "2026-07-02",
    deliveryDate: "2026-07-04",
    expectedDelivery: "2026-07-04",
    status: "New",
    paymentStatus: "Pending",
    address: "12, 100 Feet Road, Indiranagar, Bengaluru",
    contact: "Ravi Kumar - +91 98888 11111",
    invoice: "",
    remarks: "",
    rejectReason: "",
    items: [
      { name: "Paneer", quantity: 30, availableQuantity: 30, unit: "kg", rate: 220, tax: 5, available: "Available" },
      { name: "Basmati Rice", quantity: 50, availableQuantity: 45, unit: "kg", rate: 96, tax: 5, available: "Partial" },
    ],
  },
  {
    id: "PO-24066",
    supplierId: "SUP-001",
    restaurant: "Demo Spice House",
    branch: "Koramangala",
    orderDate: "2026-06-30",
    deliveryDate: "2026-07-02",
    expectedDelivery: "2026-07-02",
    status: "Accepted",
    paymentStatus: "Partially paid",
    address: "4th Block, Koramangala, Bengaluru",
    contact: "Neha Shah - +91 97777 22222",
    invoice: "INV-7742.pdf",
    remarks: "Rice quantity adjusted as per current stock.",
    rejectReason: "",
    items: [
      { name: "Cooking Oil", quantity: 24, availableQuantity: 24, unit: "ltr", rate: 138, tax: 5, available: "Available" },
      { name: "Coffee Beans", quantity: 12, availableQuantity: 12, unit: "kg", rate: 640, tax: 12, available: "Available" },
    ],
  },
  {
    id: "PO-24058",
    supplierId: "SUP-001",
    restaurant: "Demo Spice House",
    branch: "Whitefield",
    orderDate: "2026-06-24",
    deliveryDate: "2026-06-27",
    expectedDelivery: "2026-06-27",
    status: "Delivered",
    paymentStatus: "Paid",
    address: "ITPL Main Road, Whitefield, Bengaluru",
    contact: "Arjun Menon - +91 96666 33333",
    invoice: "INV-7688.pdf",
    remarks: "Delivered at dock gate 2.",
    rejectReason: "",
    items: [
      { name: "Fresh Vegetables", quantity: 80, availableQuantity: 80, unit: "kg", rate: 42, tax: 0, available: "Available" },
    ],
  },
];

const starterUsers = [
  { id: 1, name: "VESTORA Super Admin", email: "super@vestora.test", password: "Super@123", role: "Super Admin", status: "Active", storeId: "GLOBAL" },
  { id: 2, name: "Restaurant Admin", email: "admin@vestora.test", password: "Admin@123", role: "Restaurant Admin", status: "Active", storeId: "STORE-001" },
  { id: 3, name: "Counter One", email: "cashier@demo.test", password: "Cashier@123", role: "Cashier", status: "Active", storeId: "STORE-001" },
  { id: 4, name: "Kitchen Lead", email: "kitchen@demo.test", password: "Kitchen@123", role: "Chef", status: "Active", storeId: "STORE-001" },
];

const defaultBillTemplate = {
  restaurantName: "Demo Spice House",
  address: "Indiranagar, Bengaluru",
  phone: "+91 90000 11111",
  email: "hello@vestora.test",
  gst: "27ABCDE1234F1Z5",
  fssai: "10019064001234",
  billTitle: "TAX INVOICE",
  tagline: "Fresh food. Fast service.",
  footer: "Thank you. Visit again.",
  terms: "Goods once sold cannot be returned.",
  qrText: "Scan to pay / follow us",
  copyLabel: "Customer copy",
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showEmail: false,
  showGst: true,
  showFssai: true,
  showCustomer: true,
  showOrderInfo: true,
  showPayment: true,
  showTaxBreakup: true,
  showItemCount: true,
  showQrBox: false,
  showTerms: true,
  logoData: "",
  printerSize: "80mm",
  layout: "Detailed",
  logoPosition: "Left",
  fontSize: 13,
};

const billFontSizePresets = {
  Small: 12,
  Normal: 13,
  Large: 15,
};

function getBillFontSize(value) {
  const preset = billFontSizePresets[value];
  const numeric = Number(preset ?? value);
  if (!Number.isFinite(numeric)) return defaultBillTemplate.fontSize;
  return Math.min(22, Math.max(10, Math.round(numeric)));
}

function getBillPaperStyle(billTemplate) {
  return { "--bill-font-size": `${getBillFontSize(billTemplate?.fontSize)}px` };
}

const defaultKotPrinter = {
  enabled: false,
  name: "Kitchen KOT Printer",
  type: "Thermal LAN printer",
  ip: "192.168.1.88",
  port: "9100",
  paper: "80mm",
  copies: 1,
  autoPrint: true,
  status: "Disconnected",
};

const baseDashboard = {
  sales: 91300,
  orders: 251,
  orderMix: { "Dine-in": 96, Takeaway: 54, Delivery: 71, Online: 30 },
  payments: { UPI: 52, Card: 24, Cash: 19, Credit: 5, Wallet: 0, Split: 0 },
};

const roleModuleAccess = {
  "Super Admin": modules.map((module) => module.id),
  "Restaurant Admin": modules.map((module) => module.id),
  "Branch Manager": ["dashboard", "pos", "kds", "tables", "menu", "inventory", "production", "crm", "attendance", "reports", "settings"],
  "HR Manager": ["dashboard", "attendance", "reports", "settings"],
  Cashier: ["dashboard", "pos", "tables", "finance"],
  Waiter: ["tables", "kds"],
  Chef: ["kds", "inventory", "production"],
  Accountant: ["dashboard", "finance", "reports"],
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatPreciseMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function roleToAuthRole(role) {
  if (["Super Admin", "super_admin"].includes(role)) return "super_admin";
  if (["Restaurant Admin", "restaurant_admin"].includes(role)) return "restaurant_admin";
  if (role === "supplier") return "supplier";
  return "restaurant_user";
}

function roleLabelForUser(user) {
  if (user?.appRole) return user.appRole;
  if (["super_admin", "Super Admin"].includes(user?.role)) return "Super Admin";
  if (["restaurant_admin", "Restaurant Admin"].includes(user?.role)) return "Restaurant Admin";
  return user?.role || "Cashier";
}

function normalizeStoreId(storeId) {
  return storeId && storeId !== "GLOBAL" ? storeId : "STORE-001";
}

function storeLabel(store) {
  if (!store) return "Demo Spice House / Indiranagar";
  return `${store.name} / ${store.branch}`;
}

function poTotal(order) {
  return order.items.reduce((sum, item) => {
    const taxable = item.availableQuantity * item.rate;
    return sum + taxable + Math.round((taxable * item.tax) / 100);
  }, 0);
}

function loadStoredArray(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function stripUntouchedDefaultRecords(records, defaults, markerFields = []) {
  const defaultIds = new Set(defaults.map((item) => item.id));
  return records.filter((record) => !defaultIds.has(record.id) || markerFields.some((field) => record[field]));
}

function loadStoredObject(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

const themePresets = {
  Emerald: { primaryColor: "#17604b", accentColor: "#c28a3a", sidebarColor: "#10231f", backgroundColor: "#f7f8f5", surfaceColor: "#ffffff", textColor: "#10231f", mutedColor: "#60736a" },
  Indigo: { primaryColor: "#3657b3", accentColor: "#d48a27", sidebarColor: "#172142", backgroundColor: "#f5f7fd", surfaceColor: "#ffffff", textColor: "#111d3a", mutedColor: "#64708b" },
  Rose: { primaryColor: "#b33d5c", accentColor: "#2f8f7b", sidebarColor: "#301623", backgroundColor: "#fff7f8", surfaceColor: "#ffffff", textColor: "#27151c", mutedColor: "#746068" },
  Slate: { primaryColor: "#405163", accentColor: "#b47a30", sidebarColor: "#18212a", backgroundColor: "#f5f7f8", surfaceColor: "#ffffff", textColor: "#17212b", mutedColor: "#65727b" },
  Ocean: { primaryColor: "#087c8f", accentColor: "#f0a22e", sidebarColor: "#082f3d", backgroundColor: "#f1f9fb", surfaceColor: "#ffffff", textColor: "#0e2630", mutedColor: "#5f7480" },
  Graphite: { primaryColor: "#5f6f82", accentColor: "#9f7aea", sidebarColor: "#111827", backgroundColor: "#f3f4f6", surfaceColor: "#ffffff", textColor: "#111827", mutedColor: "#6b7280" },
};

const themeColorFields = [
  ["sidebarColor", "Sidebar", "Navigation background"],
  ["primaryColor", "Primary", "Buttons, active states"],
  ["accentColor", "Accent", "Highlights and focus"],
  ["backgroundColor", "Background", "Page canvas"],
  ["surfaceColor", "Surface", "Cards and panels"],
  ["textColor", "Text", "Headings and main copy"],
  ["mutedColor", "Muted", "Secondary labels"],
];

const languageOptions = [
  "English",
  "Hindi",
  "Kannada",
  "Tamil",
  "Malayalam",
  "Telugu",
  "Marathi",
  "Bengali",
  "Arabic",
];

const currencyOptions = [
  ["INR", "INR - Indian Rupee"],
  ["USD", "USD - US Dollar"],
  ["AED", "AED - UAE Dirham"],
  ["SAR", "SAR - Saudi Riyal"],
  ["EUR", "EUR - Euro"],
  ["GBP", "GBP - British Pound"],
  ["SGD", "SGD - Singapore Dollar"],
  ["MYR", "MYR - Malaysian Ringgit"],
  ["LKR", "LKR - Sri Lankan Rupee"],
  ["NPR", "NPR - Nepalese Rupee"],
];

const placeTimezoneOptions = [
  ["Asia/Kolkata", "India - Kolkata"],
  ["Asia/Dubai", "UAE - Dubai"],
  ["Asia/Riyadh", "Saudi Arabia - Riyadh"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Kuala_Lumpur", "Malaysia - Kuala Lumpur"],
  ["Asia/Colombo", "Sri Lanka - Colombo"],
  ["Asia/Kathmandu", "Nepal - Kathmandu"],
  ["Europe/London", "United Kingdom - London"],
  ["Europe/Berlin", "Germany - Berlin"],
  ["America/New_York", "USA - New York"],
  ["America/Los_Angeles", "USA - Los Angeles"],
];

function safeColorValue(value, fallback = "#17604b") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function hexToRgb(hex) {
  const clean = safeColorValue(hex).slice(1);
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}

function relativeLuminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function readableTextColor(background) {
  const color = safeColorValue(background, "#ffffff");
  return contrastRatio("#10231f", color) >= contrastRatio("#ffffff", color) ? "#10231f" : "#ffffff";
}

function readableMutedColor(background) {
  return readableTextColor(background) === "#ffffff" ? "#cbd5d1" : "#60736a";
}

function ensureReadableText(color, background, minimumRatio = 4.5) {
  const foreground = safeColorValue(color, readableTextColor(background));
  const backdrop = safeColorValue(background, "#ffffff");
  return contrastRatio(foreground, backdrop) >= minimumRatio ? foreground : readableTextColor(backdrop);
}

const defaultThemeConfig = {
  mode: "Light",
  preset: "Emerald",
  ...themePresets.Emerald,
};

function normalizeThemeConfig(config) {
  const saved = config || {};
  const preset = themePresets[saved.preset] ? saved.preset : "Emerald";
  const base = saved.preset === "Custom" ? defaultThemeConfig : themePresets[preset];
  return {
    ...defaultThemeConfig,
    ...base,
    ...saved,
    mode: saved.mode === "Dark" ? "Dark" : "Light",
    preset: saved.preset === "Custom" ? "Custom" : preset,
  };
}

function themeStyleVariables(config) {
  const theme = normalizeThemeConfig(config);
  const primaryColor = safeColorValue(theme.primaryColor);
  const accentColor = safeColorValue(theme.accentColor, "#c28a3a");
  const sidebarColor = safeColorValue(theme.sidebarColor, "#10231f");
  const backgroundColor = safeColorValue(theme.backgroundColor, "#f7f8f5");
  const surfaceColor = safeColorValue(theme.surfaceColor, "#ffffff");
  return {
    "--theme-primary": primaryColor,
    "--theme-accent": accentColor,
    "--theme-sidebar": sidebarColor,
    "--theme-bg": backgroundColor,
    "--theme-surface": surfaceColor,
    "--theme-text": ensureReadableText(theme.textColor, surfaceColor),
    "--theme-muted": ensureReadableText(theme.mutedColor, surfaceColor, 3),
    "--theme-on-primary": readableTextColor(primaryColor),
    "--theme-on-accent": readableTextColor(accentColor),
    "--theme-on-sidebar": readableTextColor(sidebarColor),
    "--theme-on-surface": readableTextColor(surfaceColor),
  };
}

function normalizeProductionUnit(unit) {
  const normalized = String(unit || "").trim().toLowerCase();
  const aliases = {
    kilogram: "kg", kilograms: "kg", kgs: "kg",
    gram: "g", grams: "g", gm: "g", gms: "g",
    milligram: "mg", milligrams: "mg",
    l: "litre", ltr: "litre", liter: "litre", liters: "litre", litres: "litre",
    millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
    pc: "piece", pcs: "piece", pieces: "piece",
    pack: "packet", packs: "packet", packets: "packet",
    bottles: "bottle", cans: "can", trays: "tray", boxes: "box", cups: "cup",
    spoons: "spoon", tablespoons: "tablespoon", teaspoons: "teaspoon",
    bundles: "bundle", cyl: "cylinder", cylinders: "cylinder",
  };
  return aliases[normalized] || normalized;
}

function unitFamily(unit) {
  const normalized = normalizeProductionUnit(unit);
  if (weightUnits[normalized]) return "weight";
  if (volumeUnits[normalized]) return "volume";
  return "count";
}

function unitsAreCompatible(firstUnit, secondUnit) {
  if (!firstUnit || !secondUnit) return false;
  const firstFamily = unitFamily(firstUnit);
  const secondFamily = unitFamily(secondUnit);
  if (firstFamily !== secondFamily) return false;
  if (firstFamily !== "count") return true;
  const countGroup = (unit) => {
    const normalized = normalizeProductionUnit(unit);
    return normalized === "dozen" ? "piece" : normalized;
  };
  return countGroup(firstUnit) === countGroup(secondUnit);
}

function unitFactor(unit) {
  const normalized = normalizeProductionUnit(unit);
  if (weightUnits[normalized]) return weightUnits[normalized];
  if (volumeUnits[normalized]) return volumeUnits[normalized];
  return countUnits[normalized] || 1;
}

function toBaseQuantity(qty, unit) {
  return Number(qty || 0) * unitFactor(unit);
}

function displayUnitFor(unit) {
  const family = unitFamily(unit);
  if (family === "weight") return "kg";
  if (family === "volume") return "litre";
  const normalized = normalizeProductionUnit(unit);
  return normalized === "dozen" ? "piece" : normalized;
}

function fromBaseQuantity(qty, unit) {
  const family = unitFamily(unit);
  if (family === "weight") return Number(qty || 0) / 1000;
  if (family === "volume") return Number(qty || 0) / 1000;
  return Number(qty || 0);
}

function formatProductionQty(qty, unit) {
  const displayQty = fromBaseQuantity(qty, unit);
  const decimals = Math.abs(displayQty) >= 10 ? 1 : 2;
  return `${Number(displayQty.toFixed(decimals))} ${displayUnitFor(unit)}`;
}

function parseProductionQty(value) {
  const [quantity = "0", ...unitParts] = String(value || "").trim().split(/\s+/);
  return { quantity: Number(quantity) || 0, unit: unitParts.join(" ") };
}

function ingredientCostPerBase(ingredient) {
  return Number(ingredient?.cost || 0) / Math.max(toBaseQuantity(1, ingredient?.unit), 1);
}

function getRecipeCostDetails(recipe, inventory) {
  return (recipe?.ingredients || []).reduce((details, item) => {
    const stockItem = inventory.find((ingredient) => ingredient.name === item.name);
    if (!stockItem || !unitsAreCompatible(item.unit, stockItem.unit)) {
      details.missingIngredients.push(item.name);
      return details;
    }
    details.cost += toBaseQuantity(item.qty, item.unit) * ingredientCostPerBase(stockItem);
    return details;
  }, { cost: 0, missingIngredients: [] });
}

function calculateRecipeCost(recipe, inventory) {
  return getRecipeCostDetails(recipe, inventory).cost;
}

function calculateRequirements(recipe, qty, inventory) {
  const requiredMap = new Map();
  (recipe?.ingredients || []).forEach((item) => {
    const key = item.name;
    const requiredBase = toBaseQuantity(item.qty, item.unit) * Number(qty || 0);
    const existing = requiredMap.get(key);
    requiredMap.set(key, existing ? { ...existing, requiredBase: existing.requiredBase + requiredBase } : { ...item, requiredBase });
  });
  return Array.from(requiredMap.values()).map((item) => {
    const stockItem = inventory.find((ingredient) => ingredient.name === item.name);
    const unitsMatch = stockItem && unitsAreCompatible(item.unit, stockItem.unit);
    const stockBase = stockItem ? toBaseQuantity(stockItem.stock, stockItem.unit) : 0;
    const cost = unitsMatch ? item.requiredBase * ingredientCostPerBase(stockItem) : 0;
    return {
      ...item,
      stockBase,
      cost,
      afterBase: stockBase - item.requiredBase,
      status: unitsMatch && stockBase >= item.requiredBase ? "OK" : "Short",
    };
  });
}

function isTodayDate(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function localDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportDateLabel(key) {
  if (!key) return "No date";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isInReportRange(value, range) {
  if (range === "All") return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "Today") return isTodayDate(value);
  if (range === "7 days") {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() - 6);
    return date >= weekStart;
  }
  if (range === "Month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return true;
}

function isOnReportDate(value, dateKey) {
  if (!dateKey) return true;
  return localDateKey(value) === dateKey;
}

function groupBills(bills, keyGetter) {
  return bills.reduce((groups, bill) => {
    const key = keyGetter(bill) || "Unknown";
    const current = groups[key] || { orders: 0, sales: 0, tax: 0, discount: 0, items: 0 };
    groups[key] = {
      orders: current.orders + 1,
      sales: current.sales + Number(bill.total || 0),
      tax: current.tax + Number(bill.tax || 0),
      discount: current.discount + Number(bill.discount || 0),
      items: current.items + Number(bill.itemCount || 0),
    };
    return groups;
  }, {});
}

function groupItems(bills) {
  return bills.reduce((items, bill) => {
    (bill.items || []).forEach((item) => {
      const current = items[item.name] || { qty: 0, sales: 0 };
      items[item.name] = {
        qty: current.qty + Number(item.qty || 0),
        sales: current.sales + Number(item.price || 0) * Number(item.qty || 0),
      };
    });
    return items;
  }, {});
}

function columnLetter(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function createKdsOrderFromBill(bill) {
  return {
    id: bill.id.replace("BILL", "KOT"),
    storeId: bill.storeId,
    table: bill.orderType,
    age: "Just now",
    status: "New",
    items: bill.items.map((item) => `${item.qty} ${item.name}`),
    createdAt: bill.createdAt || new Date().toISOString(),
  };
}

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function syncOfflineOrders() {
  const queued = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]");
  if (!queued.length || !navigator.onLine) return queued.length;
  localStorage.setItem("vestora-offline-orders", "[]");
  return 0;
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("vestora-current-user");
    if (!saved) return null;
    const user = JSON.parse(saved);
    return { ...user, role: roleToAuthRole(user.role), appRole: user.appRole || roleLabelForUser(user) };
  });
  const [active, setActive] = useState("dashboard");
  const [returnModule, setReturnModule] = useState("dashboard");
  const [superAdminLanding, setSuperAdminLanding] = useState(() => currentUser?.role === "super_admin" && localStorage.getItem("vestora-super-admin-in-store") !== "true");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [adminView, setAdminView] = useState("all");
  const [menuNavOpen, setMenuNavOpen] = useState(false);
  const [menuView, setMenuView] = useState("items");
  const [menuItemEditId, setMenuItemEditId] = useState("");
  const [productionNavOpen, setProductionNavOpen] = useState(false);
  const [productionView, setProductionView] = useState("Recipes");
  const [productionReportsOpen, setProductionReportsOpen] = useState(false);
  const [productionReportView, setProductionReportView] = useState("Daily Production");
  const [attendanceNavOpen, setAttendanceNavOpen] = useState(false);
  const [attendanceView, setAttendanceView] = useState("Add Face ID");
  const [financeNavOpen, setFinanceNavOpen] = useState(false);
  const [financeView, setFinanceView] = useState("Expenses");
  const [reportNavOpen, setReportNavOpen] = useState(false);
  const [reportView, setReportView] = useState("Daily sales");
  const [themeConfig, setThemeConfig] = useState(() => normalizeThemeConfig(loadStoredObject("vestora-theme-config")));
  const [dark, setDark] = useState(() => themeConfig.mode === "Dark");
  const [cart, setCart] = useState([]);
  const [posCashier, setPosCashier] = useState(() => loadStoredObject("vestora-pos-cashier"));
  const [orderType, setOrderType] = useState("Dine-in");
  const [toast, setToast] = useState("");
  const [lastShiftClose, setLastShiftClose] = useState(() => loadStoredObject("vestora-last-shift-close"));
  const [currentShift, setCurrentShift] = useState(() => {
    const saved = localStorage.getItem("vestora-current-shift");
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState(() => {
    const savedUsers = loadStoredArray("vestora-users");
    return savedUsers.length ? savedUsers : starterUsers;
  });
  const [stores, setStores] = useState(() => {
    const savedStores = localStorage.getItem("vestora-stores");
    if (savedStores !== null) {
      try {
        const parsedStores = JSON.parse(savedStores);
        if (Array.isArray(parsedStores)) return parsedStores;
      } catch {
        // Fall through to the starter directory only when saved data is invalid.
      }
    }
    return defaultStores;
  });
  const [selectedStoreId, setSelectedStoreId] = useState(() => localStorage.getItem("vestora-selected-store") || "STORE-001");
  const [billTemplate, setBillTemplate] = useState(() => {
    const saved = localStorage.getItem("vestora-bill-template");
    return saved ? { ...defaultBillTemplate, ...JSON.parse(saved) } : defaultBillTemplate;
  });
  const [kotPrinter, setKotPrinter] = useState(() => {
    const saved = localStorage.getItem("vestora-kot-printer");
    return saved ? { ...defaultKotPrinter, ...JSON.parse(saved) } : defaultKotPrinter;
  });
  const [salesLedger, setSalesLedger] = useState(() => loadStoredArray("vestora-sales-ledger"));
  const [voidLedger, setVoidLedger] = useState(() => loadStoredArray("vestora-void-ledger"));
  const [refundLedger, setRefundLedger] = useState(() => loadStoredArray("vestora-refund-ledger"));
  const [kdsOrders, setKdsOrders] = useState(() => loadStoredArray("vestora-kds-orders"));
  const [tableOrders, setTableOrders] = useState(() => loadStoredArray("vestora-table-orders"));
  const tableOrdersChannelRef = useRef(null);
  const [supplierOrders, setSupplierOrders] = useState(() => loadStoredArray("vestora-supplier-orders"));
  const online = useOnlineStatus();
  const queuedOrders = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]").length;
  const canManageAll = currentUser?.role === "super_admin";
  const canManage = canManageAll || currentUser?.role === "restaurant_admin";
  const activeStoreId = canManageAll ? selectedStoreId : normalizeStoreId(currentUser?.storeId);
  const activeStore = stores.find((store) => store.id === activeStoreId) || stores[0] || defaultStores[0];
  const [productItems, setProductItems] = useState(() => {
    const saved = loadStoredArray(`vestora-menu-items-${activeStore.id}`);
    return saved.length ? saved : menuItems;
  });
  const scopedSalesLedger = salesLedger.filter((bill) => normalizeStoreId(bill.storeId) === activeStore.id);
  const scopedVoidLedger = voidLedger.filter((entry) => normalizeStoreId(entry.storeId) === activeStore.id);
  const scopedRefundLedger = refundLedger.filter((entry) => normalizeStoreId(entry.storeId) === activeStore.id);
  const scopedKdsOrders = kdsOrders.filter((order) => normalizeStoreId(order.storeId) === activeStore.id);
  const scopedTableOrders = tableOrders.filter((order) => normalizeStoreId(order.storeId) === activeStore.id);
  const activeCashiers = users.filter((user) => normalizeStoreId(user.storeId) === activeStore.id && user.role === "Cashier" && user.status === "Active");
  const comparisonStores = (canManageAll ? stores.filter((store) => store.name === activeStore.name) : [activeStore])
    .filter((store) => store && store.status !== "Inactive" && (store.branch || store.id === activeStore.id));
  const comparisonSalesLedger = canManageAll ? salesLedger : scopedSalesLedger;
  const currentRoleLabel = roleLabelForUser(currentUser);
  const allowedModuleIds = roleModuleAccess[currentRoleLabel] || roleModuleAccess.Cashier;
  const visibleModules = modules.filter((module) => allowedModuleIds.includes(module.id));
  const activeModule = visibleModules.some((module) => module.id === active) ? active : visibleModules[0]?.id || "dashboard";
  const themeVariables = themeStyleVariables(themeConfig);

  useEffect(() => {
    localStorage.setItem("vestora-theme-config", JSON.stringify({ ...themeConfig, mode: dark ? "Dark" : "Light" }));
  }, [themeConfig, dark]);

  function notify(message) {
    setToast(message);
    window.clearTimeout(window.vestoraToastTimer);
    window.vestoraToastTimer = window.setTimeout(() => setToast(""), 2600);
  }

  function handleLogin(user) {
    const loginUser = { ...user, storeId: user.storeId || "STORE-001" };
    const loginRole = roleLabelForUser(loginUser);
    const landingModule = loginRole === "Waiter" ? "tables" : loginRole === "Chef" ? "kds" : "dashboard";
    setCurrentUser(loginUser);
    setActive(landingModule);
    setReturnModule(landingModule);
    if (loginUser.role === "super_admin") {
      setSuperAdminLanding(true);
      localStorage.removeItem("vestora-super-admin-in-store");
    } else {
      setSuperAdminLanding(false);
      setSelectedStoreId(normalizeStoreId(loginUser.storeId));
      localStorage.setItem("vestora-selected-store", normalizeStoreId(loginUser.storeId));
    }
    localStorage.setItem("vestora-current-user", JSON.stringify(loginUser));
  }

  function openModule(moduleId) {
    if (moduleId === "pos") {
      setReturnModule(activeModule === "pos" ? returnModule : activeModule);
    } else {
      setReturnModule(moduleId);
    }
    if (moduleId !== "admin") setAdminMenuOpen(false);
    if (moduleId !== "menu") setMenuNavOpen(false);
  if (moduleId !== "production") setProductionNavOpen(false);
  if (moduleId !== "attendance") setAttendanceNavOpen(false);
  if (moduleId !== "finance") setFinanceNavOpen(false);
  if (moduleId !== "reports") setReportNavOpen(false);
    setActive(moduleId);
  }

  function openMenuView(view, itemId = "") {
    setMenuView(view);
    setMenuItemEditId(itemId);
    setMenuNavOpen(true);
    setReturnModule("menu");
    setActive("menu");
    window.scrollTo(0, 0);
  }

  function openAdminView(view) {
    setAdminView(view);
    setAdminMenuOpen(true);
    setReturnModule("admin");
    setActive("admin");
  window.scrollTo(0, 0);
  }

  function openProductionView(view) {
    setProductionView(view);
    setProductionNavOpen(true);
    setReturnModule("production");
    setActive("production");
    window.scrollTo(0, 0);
  }

  function openProductionReport(report) {
    setProductionReportView(report);
    setProductionReportsOpen(true);
    openProductionView("Reports");
  }

  function openAttendanceView(view) {
    setAttendanceView(view);
    setAttendanceNavOpen(true);
    setReturnModule("attendance");
    setActive("attendance");
    window.scrollTo(0, 0);
  }

  function openReportView(view) {
    setReportView(view);
    setReportNavOpen(true);
    setReturnModule("reports");
    setActive("reports");
    window.scrollTo(0, 0);
  }

  function openFinanceView(view) {
    setFinanceView(view);
    setFinanceNavOpen(true);
    setReturnModule("finance");
    setActive("finance");
    window.scrollTo(0, 0);
  }

  function handleLogout() {
    localStorage.removeItem("vestora-current-user");
    localStorage.removeItem("vestora-super-admin-in-store");
    localStorage.removeItem("vestora-pos-cashier");
    setPosCashier(null);
    setCurrentUser(null);
  }

  function enterStore(store) {
    setSelectedStoreId(store.id);
    setSuperAdminLanding(false);
    localStorage.setItem("vestora-super-admin-in-store", "true");
    setActive("dashboard");
    notify(`${store.name} ${store.branch} opened`);
  }

  function backToStores() {
    setSuperAdminLanding(true);
    localStorage.removeItem("vestora-super-admin-in-store");
    notify("Store list opened");
  }

  function exitPOS() {
    const fallback = visibleModules.some((module) => module.id === returnModule) ? returnModule : "dashboard";
    setActive(fallback);
    notify("POS closed");
  }

  function openShift(openingBalance) {
    const balance = Number(openingBalance);
    const shift = {
      id: `SHIFT-${Date.now()}`,
      openingBalance: balance,
      openedAt: new Date().toISOString(),
      cashierId: posCashier?.id || "",
      cashierName: posCashier?.name || "POS User",
    };
    setCurrentShift(shift);
    localStorage.setItem("vestora-current-shift", JSON.stringify(shift));
    notify("Shift opened");
  }

  function closeShift(closingBalance, closeDetails = {}) {
    const balance = Number(closingBalance);
    const shiftClose = {
      ...currentShift,
      ...closeDetails,
      storeId: activeStore.id,
      storeName: activeStore.name,
      branch: activeStore.branch,
      closingBalance: balance,
      closedAt: new Date().toISOString(),
    };
    setLastShiftClose(shiftClose);
    setCurrentShift(null);
    localStorage.setItem("vestora-last-shift-close", JSON.stringify(shiftClose));
    localStorage.removeItem("vestora-current-shift");
    localStorage.removeItem("vestora-pos-cashier");
    setPosCashier(null);
    exitPOS();
    notify(`Shift closed at ${formatMoney(balance)}`);
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(publicAssetPath("service-worker.js"));
  }, []);

  useEffect(() => {
    if (posCashier) localStorage.setItem("vestora-pos-cashier", JSON.stringify(posCashier));
    else localStorage.removeItem("vestora-pos-cashier");
  }, [posCashier]);

  useEffect(() => {
    if (online && syncOfflineOrders()) notify("Offline bills synced successfully");
  }, [online]);

  useEffect(() => {
    localStorage.setItem("vestora-sales-ledger", JSON.stringify(salesLedger));
  }, [salesLedger]);

  useEffect(() => {
    localStorage.setItem("vestora-void-ledger", JSON.stringify(voidLedger));
  }, [voidLedger]);

  useEffect(() => {
    localStorage.setItem("vestora-refund-ledger", JSON.stringify(refundLedger));
  }, [refundLedger]);

  useEffect(() => {
    localStorage.setItem("vestora-kds-orders", JSON.stringify(kdsOrders));
  }, [kdsOrders]);

  useEffect(() => {
    localStorage.setItem("vestora-table-orders", JSON.stringify(tableOrders));
  }, [tableOrders]);

  useEffect(() => {
    const receiveTableOrders = (orders) => {
      if (Array.isArray(orders)) setTableOrders(orders);
    };
    const handleStorage = (event) => {
      if (event.key !== "vestora-table-orders" || !event.newValue) return;
      try {
        receiveTableOrders(JSON.parse(event.newValue));
      } catch {
        // Ignore incomplete data written by another tab.
      }
    };

    window.addEventListener("storage", handleStorage);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("vestora-table-orders");
      channel.onmessage = (event) => receiveTableOrders(event.data);
      tableOrdersChannelRef.current = channel;
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      tableOrdersChannelRef.current?.close();
      tableOrdersChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("vestora-users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem("vestora-stores", JSON.stringify(stores));
  }, [stores]);

  useEffect(() => {
    localStorage.setItem("vestora-selected-store", activeStore.id);
  }, [activeStore.id]);

  useEffect(() => {
    localStorage.setItem("vestora-bill-template", JSON.stringify(billTemplate));
  }, [billTemplate]);

  useEffect(() => {
    localStorage.setItem("vestora-kot-printer", JSON.stringify(kotPrinter));
  }, [kotPrinter]);

  useEffect(() => {
    const saved = loadStoredArray(`vestora-menu-items-${activeStore.id}`);
    setProductItems(saved.length ? saved : menuItems);
  }, [activeStore.id]);

  useEffect(() => {
    localStorage.setItem(`vestora-menu-items-${activeStore.id}`, JSON.stringify(productItems));
  }, [activeStore.id, productItems]);

  useEffect(() => {
    if (!supplierOrders.length) setSupplierOrders(initialSupplierOrders);
  }, []);

  useEffect(() => {
    localStorage.setItem("vestora-supplier-orders", JSON.stringify(supplierOrders));
  }, [supplierOrders]);

  useEffect(() => {
    if (currentUser && currentUser.role !== "supplier" && active !== activeModule) setActive(activeModule);
  }, [currentUser, active, activeModule]);

  function recordSale(bill) {
    const savedBill = {
      ...bill,
      storeId: activeStore.id,
      storeName: activeStore.name,
      branch: activeStore.branch,
      shiftId: currentShift?.id || "",
      createdAt: new Date().toISOString(),
    };
    setSalesLedger((current) => [savedBill, ...current]);
    if (!savedBill.tableOrderId) {
      setKdsOrders((current) => [createKdsOrderFromBill(savedBill), ...current]);
      if (kotPrinter.enabled && kotPrinter.status === "Connected" && kotPrinter.autoPrint) notify(`KOT queued for ${kotPrinter.name}`);
    }
  }

  function saveTableOrder(order) {
    const savedOrder = { ...order, storeId: activeStore.id, storeName: activeStore.name, branch: activeStore.branch };
    setTableOrders((current) => {
      const exists = current.some((entry) => entry.id === savedOrder.id);
      const nextOrders = exists ? current.map((entry) => entry.id === savedOrder.id ? savedOrder : entry) : [savedOrder, ...current];
      localStorage.setItem("vestora-table-orders", JSON.stringify(nextOrders));
      tableOrdersChannelRef.current?.postMessage(nextOrders);
      return nextOrders;
    });
    return savedOrder;
  }

  function sendTableKot(order) {
    const previousQuantities = order.kotQuantities || {};
    const kotItems = (order.items || []).map((item) => ({
      ...item,
      qty: Math.max(0, Number(item.qty || 0) - Number(previousQuantities[item.id] || 0)),
    })).filter((item) => item.qty > 0);
    if (!kotItems.length) {
      notify("Add an item or increase a quantity before printing an add-on KOT");
      return { ...order, kotNoChanges: true };
    }
    const kotId = `KOT-${Date.now()}`;
    const kotQuantities = Object.fromEntries((order.items || []).map((item) => [item.id, Number(item.qty || 0)]));
    const sentOrder = saveTableOrder({ ...order, kotId, kotIds: [...(order.kotIds || []), kotId], kotQuantities, status: "KOT sent", kotSentAt: new Date().toISOString() });
    const ticket = {
      id: kotId,
      storeId: activeStore.id,
      table: sentOrder.tableName,
      waiter: sentOrder.waiterName,
      age: "Just now",
      status: "New",
      items: kotItems.map((item) => `${item.qty} ${item.name}${item.notes ? ` - ${item.notes}` : ""}`),
      createdAt: new Date().toISOString(),
      tableOrderId: sentOrder.id,
    };
    setKdsOrders((current) => current.some((entry) => entry.id === kotId) ? current : [ticket, ...current]);
    notify(kotPrinter.enabled && kotPrinter.status === "Connected" ? `KOT sent to ${kotPrinter.name}` : "KOT added to kitchen queue; connect printer for paper copy");
    return { ...sentOrder, kotPrintItems: kotItems };
  }

  function sendTableToReception(order) {
    const receptionOrder = saveTableOrder({ ...order, status: "Ready for billing", receptionSentAt: new Date().toISOString() });
    notify(`${order.tableName} sent to reception for billing`);
    return receptionOrder;
  }

  function completeTableOrder(order, bill) {
    saveTableOrder({ ...order, status: "Paid", billId: bill.id, paidAt: new Date().toISOString() });
    const tableKey = `vestora-tables-${activeStore.id}`;
    const savedTables = loadStoredArray(tableKey);
    if (savedTables.length) {
      localStorage.setItem(tableKey, JSON.stringify(savedTables.map((table) => table.id === order.tableId ? { ...table, status: "Available" } : table)));
    }
    notify(`${order.tableName} paid and marked available`);
  }

  function recordVoidItem(item, billingType) {
    const voidEntry = {
      id: `VOID-${Date.now()}`,
      storeId: activeStore.id,
      storeName: activeStore.name,
      branch: activeStore.branch,
      shiftId: currentShift?.id || "",
      itemName: item.name,
      category: item.category,
      qty: item.qty,
      rate: item.price,
      amount: Number(item.price || 0) * Number(item.qty || 0),
      orderType: billingType,
      status: "Item deleted before billing",
      createdAt: new Date().toISOString(),
    };
    setVoidLedger((current) => [voidEntry, ...current]);
  }

  function recordTableCancellation({ order, item = null, reason, type }) {
    const isOrder = type === "order";
    const voidEntry = {
      id: `VOID-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      storeId: activeStore.id,
      storeName: activeStore.name,
      branch: activeStore.branch,
      shiftId: currentShift?.id || "",
      orderNumber: order.orderNumber,
      tableName: order.tableName,
      itemName: isOrder ? `${order.orderNumber} / Table ${order.tableName}` : item.name,
      category: isOrder ? "Table order" : item.category,
      qty: isOrder ? Number(order.itemCount || 0) : Number(item.qty || 0),
      rate: isOrder ? Number(order.subtotal || 0) : Number(item.price || 0),
      amount: isOrder ? Number(order.subtotal || 0) : Number(item.price || 0) * Number(item.qty || 0),
      orderType: `Dine-in / ${order.tableName}`,
      status: `${isOrder ? "Table order cancelled" : "Table item cancelled"}: ${reason}`,
      reason,
      createdAt: new Date().toISOString(),
    };
    setVoidLedger((current) => [voidEntry, ...current]);
  }

  function cancelTableOrder(order, reason) {
    const cancelled = saveTableOrder({ ...order, status: "Cancelled", cancelReason: reason, cancelledAt: new Date().toISOString() });
    recordTableCancellation({ order: cancelled, reason, type: "order" });
    if (order.kotId) {
      setKdsOrders((current) => [{ id: `KOT-CANCEL-${Date.now()}`, storeId: activeStore.id, table: order.tableName, waiter: order.waiterName, age: "Just now", status: "New", items: [`CANCEL ORDER ${order.orderNumber} - ${reason}`], createdAt: new Date().toISOString(), tableOrderId: order.id }, ...current]);
    }
    notify(`${order.tableName} order cancelled`);
    return cancelled;
  }

  function cancelTableOrderItem(order, item, reason, nextItems) {
    const itemCount = nextItems.reduce((sum, entry) => sum + Number(entry.qty || 0), 0);
    const subtotal = nextItems.reduce((sum, entry) => sum + Number(entry.price || 0) * Number(entry.qty || 0), 0);
    const kotQuantities = { ...(order.kotQuantities || {}) };
    delete kotQuantities[item.id];
    const updated = saveTableOrder({ ...order, items: nextItems, itemCount, subtotal, kotQuantities, updatedAt: new Date().toISOString() });
    recordTableCancellation({ order, item, reason, type: "item" });
    if (order.kotId) {
      setKdsOrders((current) => [{ id: `KOT-CANCEL-${Date.now()}`, storeId: activeStore.id, table: order.tableName, waiter: order.waiterName, age: "Just now", status: "New", items: [`CANCEL ${item.qty} ${item.name} - ${reason}`], createdAt: new Date().toISOString(), tableOrderId: order.id }, ...current]);
    }
    notify(`${item.name} cancelled from ${order.tableName}`);
    return updated;
  }

  function recordRefund(refund) {
    const refundEntry = {
      id: `REF-${Date.now()}`,
      storeId: activeStore.id,
      storeName: activeStore.name,
      branch: activeStore.branch,
      shiftId: currentShift?.id || "",
      ...refund,
      amount: Number(refund.amount || 0),
      createdAt: new Date().toISOString(),
    };
    setRefundLedger((current) => [refundEntry, ...current]);
    notify(`Refund saved for ${refund.billId}`);
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (currentUser.role === "supplier") {
    return <SupplierPortal currentUser={currentUser} orders={supplierOrders} setOrders={setSupplierOrders} onLogout={() => { localStorage.removeItem("vestora-current-user"); setCurrentUser(null); }} />;
  }

  if (currentUser.role === "super_admin" && superAdminLanding) {
    return (
      <SuperAdminStoreLanding
        stores={stores}
        setStores={setStores}
        activeStore={activeStore}
        onEnterStore={enterStore}
        onLogout={() => {
          localStorage.removeItem("vestora-current-user");
          localStorage.removeItem("vestora-super-admin-in-store");
          localStorage.removeItem("vestora-pos-cashier");
          setPosCashier(null);
          setCurrentUser(null);
        }}
        notify={notify}
        toast={toast}
      />
    );
  }

  const content = {
    dashboard: <Dashboard notify={notify} salesLedger={scopedSalesLedger} refundLedger={scopedRefundLedger} kdsOrders={scopedKdsOrders} comparisonStores={comparisonStores} comparisonSalesLedger={comparisonSalesLedger} storeId={activeStore.id} onNavigate={setActive} />,
    pos: !posCashier
      ? <CashierLogin cashiers={activeCashiers} activeStore={activeStore} currentShift={currentShift} onAuthenticated={(cashier) => {
        if (currentShift?.cashierId && String(currentShift.cashierId) !== String(cashier.id)) {
          notify(`${currentShift.cashierName || "Another cashier"} must close the active shift first`);
          return false;
        }
        setPosCashier(cashier);
        localStorage.setItem("vestora-pos-cashier", JSON.stringify(cashier));
        return true;
      }} onExit={exitPOS} onLogout={handleLogout} onCreateCashier={() => openAdminView("create")} />
      : currentShift
        ? <POS cart={cart} setCart={setCart} items={productItems} orderType={orderType} setOrderType={setOrderType} online={online} notify={notify} billTemplate={billTemplate} onSale={recordSale} onVoidItem={recordVoidItem} onExit={exitPOS} onLogout={handleLogout} currentShift={currentShift} onCloseShift={closeShift} shiftBills={scopedSalesLedger.filter((bill) => bill.shiftId === currentShift.id)} shiftRefunds={scopedRefundLedger.filter((refund) => refund.shiftId === currentShift.id)} orderHistory={scopedSalesLedger} currentUser={posCashier} pendingTableOrders={scopedTableOrders.filter((order) => order.status === "Ready for billing")} onTableOrderPaid={completeTableOrder} />
        : <ShiftOpening online={online} onOpenShift={openShift} onExit={exitPOS} onLogout={handleLogout} cashier={posCashier} />,
    kds: <KDS notify={notify} orders={scopedKdsOrders} setOrders={setKdsOrders} kotPrinter={kotPrinter} />,
    tables: <Tables key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} items={productItems} currentUser={currentUser} tableOrders={scopedTableOrders} onSaveOrder={saveTableOrder} onSendKot={sendTableKot} onSendReception={sendTableToReception} onCancelOrder={cancelTableOrder} onCancelItem={cancelTableOrderItem} kotPrinter={kotPrinter} />,
    menu: <MenuManagement key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} productItems={productItems} setProductItems={setProductItems} activeView={menuView} editingItemId={menuItemEditId} onNavigate={openMenuView} />,
    inventory: <Inventory key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} />,
    production: <Production key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} activeView={productionView} activeReport={productionReportView} onViewChange={setProductionView} />,
    crm: <CRM notify={notify} canManageAll={canManage} salesLedger={scopedSalesLedger} />,
    attendance: <AttendanceModule key={activeStore.id} notify={notify} activeStore={activeStore} users={users} canManage={canManage} canManageAll={canManageAll} activeView={attendanceView} onViewChange={setAttendanceView} onOpenAdmin={() => openAdminView("create")} />,
  finance: <Finance notify={notify} canManageAll={canManage} salesLedger={scopedSalesLedger} refundLedger={scopedRefundLedger} storeId={activeStore.id} view={financeView} />,
    reports: <Reports notify={notify} storeId={activeStore.id} salesLedger={scopedSalesLedger} voidLedger={scopedVoidLedger} refundLedger={scopedRefundLedger} onRefund={recordRefund} lastShiftClose={lastShiftClose} comparisonStores={comparisonStores} comparisonSalesLedger={comparisonSalesLedger} activeView={reportView} onReportChange={setReportView} />,
    admin: <Admin notify={notify} users={users} setUsers={setUsers} currentUser={currentUser} canManageAll={canManageAll} canManageStore={canManage} stores={stores} activeStore={activeStore} activeView={adminView} onViewChange={openAdminView} />,
    settings: <SettingsView notify={notify} billTemplate={billTemplate} setBillTemplate={setBillTemplate} kotPrinter={kotPrinter} setKotPrinter={setKotPrinter} canManage={canManage} canManageAll={canManageAll} activeStore={activeStore} setStores={setStores} themeConfig={{ ...themeConfig, mode: dark ? "Dark" : "Light" }} setThemeConfig={setThemeConfig} setDark={setDark} />,
  }[activeModule];

  if (activeModule === "pos") {
    return (
      <div className={dark ? "pos-page dark" : "pos-page"} style={themeVariables}>
        {content}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className={`${dark ? "app dark" : "app"} ${sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed"}`} style={themeVariables}>
      <aside className={sidebarOpen ? "sidebar" : "sidebar collapsed"}>
        <div className="brand">
          <img src={vestoraLogoPath} alt="" />
          {sidebarOpen && <div><strong>VESTORA</strong><span>ERP & POS</span></div>}
        </div>
        <nav>
          {visibleModules.map((item) => {
            const Icon = item.icon;
            if (item.id === "menu") {
              const menuActive = activeModule === "menu";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={menuActive ? "nav active" : "nav"} onClick={() => { if (!menuActive) openModule("menu"); setMenuNavOpen((open) => menuActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && menuNavOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={menuNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && menuNavOpen && <div className="sidebar-subnav">
                    <button className={menuView === "items" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openMenuView("items")}><PackageSearch size={15} /> All items</button>
                    <button className={menuView === "create" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openMenuView("create")}><Plus size={15} /> Item creation</button>
                    <button className={menuView === "setup" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openMenuView("setup")}><ClipboardList size={15} /> Menu setup</button>
                  </div>}
                </div>
              );
            }
            if (item.id === "admin") {
              const adminActive = activeModule === "admin";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={adminActive ? "nav active" : "nav"} onClick={() => { if (!adminActive) openModule("admin"); setAdminMenuOpen((open) => adminActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && adminMenuOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={adminMenuOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && adminMenuOpen && <div className="sidebar-subnav">
                    <button className={adminView === "all" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAdminView("all")}><Users size={15} /> All users</button>
                    <button className={adminView === "create" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAdminView("create")}><UserPlus size={15} /> User creation</button>
                  </div>}
                </div>
              );
            }
            if (item.id === "production") {
              const productionActive = activeModule === "production";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={productionActive ? "nav active" : "nav"} onClick={() => { if (!productionActive) openModule("production"); setProductionNavOpen((open) => productionActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && productionNavOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={productionNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && productionNavOpen && <div className="sidebar-subnav">
                    <button className={productionView === "Recipes" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionView("Recipes")}><ClipboardList size={15} /> Recipes</button>
                    <button className={productionView === "Planning" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionView("Planning")}><CalendarClock size={15} /> Planning</button>
                    <button className={productionView === "Batches" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionView("Batches")}><PackageSearch size={15} /> Batches</button>
                    <button className={productionView === "Wastage" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionView("Wastage")}><Trash2 size={15} /> Wastage</button>
                    <div className="sidebar-subnav-report-group">
                      <button className={productionView === "Reports" ? "sidebar-subnav-item sidebar-subnav-toggle active" : "sidebar-subnav-item sidebar-subnav-toggle"} onClick={() => { if (productionView !== "Reports") openProductionView("Reports"); setProductionReportsOpen((open) => productionView === "Reports" ? !open : true); }} aria-expanded={productionReportsOpen}><ReceiptText size={15} /> Reports<ChevronDown className={productionReportsOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={14} /></button>
                      {productionReportsOpen && <div className="sidebar-nested-subnav">{productionReportNames.map((report) => <button key={report} className={productionView === "Reports" && productionReportView === report ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionReport(report)}>{report}</button>)}</div>}
                    </div>
                  </div>}
                </div>
              );
            }
            if (item.id === "attendance") {
              const attendanceActive = activeModule === "attendance";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={attendanceActive ? "nav active" : "nav"} onClick={() => { if (!attendanceActive) openModule("attendance"); setAttendanceNavOpen((open) => attendanceActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && attendanceNavOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={attendanceNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && attendanceNavOpen && <div className="sidebar-subnav attendance-sidebar-subnav">
                    <button className={attendanceView === "Add Face ID" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Add Face ID")}><UserCheck size={15} /> Add Face ID</button>
                    <button className={attendanceView === "Face Check In/Out" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Face Check In/Out")}><Camera size={15} /> Check In/Out</button>
                    <button className={attendanceView === "Attendance Report" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Attendance Report")}><FileBarChart size={15} /> Attendance report</button>
                    <button className={attendanceView === "Attendance Records" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Attendance Records")}><ClipboardList size={15} /> Attendance records</button>
                    <button className={attendanceView === "Leave Requests" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Leave Requests")}><CalendarClock size={15} /> Leave requests</button>
                    <button className={attendanceView === "Payroll Summary" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Payroll Summary")}><FileDown size={15} /> Payroll summary</button>
                    <button className={attendanceView === "Settings" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAttendanceView("Settings")}><SlidersHorizontal size={15} /> Settings</button>
                  </div>}
                </div>
              );
            }
            if (item.id === "reports") {
              const reportsActive = activeModule === "reports";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={reportsActive ? "nav active" : "nav"} onClick={() => { if (!reportsActive) openModule("reports"); setReportNavOpen((open) => reportsActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && reportNavOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={reportNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && reportNavOpen && <div className="sidebar-subnav report-sidebar-subnav">
                    <button className={reportView === "Daily sales" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openReportView("Daily sales")}><BadgeIndianRupee size={15} /> Daily sales</button>
                    <button className={reportView === "Item-wise sales" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openReportView("Item-wise sales")}><PackageSearch size={15} /> Item-wise sales</button>
                    <button className={reportView === "GST" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openReportView("GST")}><Percent size={15} /> GST report</button>
                    <button className={reportView === "Cashier closing" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openReportView("Cashier closing")}><History size={15} /> Cashier closing</button>
                    <button className={reportView === "Void and refund" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openReportView("Void and refund")}><ReceiptText size={15} /> Void & refunds</button>
                    <button className={activeModule === "production" && productionView === "Reports" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionReport(productionReportView)}><DatabaseZap size={15} /> Production reports</button>
                  </div>}
                </div>
              );
            }
            if (item.id === "finance") {
              const financeActive = activeModule === "finance";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button
                    className={financeActive ? "nav active" : "nav"}
                    onClick={() => {
                      if (!financeActive) openModule("finance");
                      setFinanceNavOpen((open) => (financeActive ? !open : true));
                    }}
                    title={item.label}
                    aria-expanded={sidebarOpen && financeNavOpen}
                  >
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={financeNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && financeNavOpen && (
                    <div className="sidebar-subnav finance-sidebar-subnav">
                      <button className={financeView === "Receipts" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Receipts")}><ReceiptText size={15} /> Receipts</button>
                      <button className={financeView === "Expenses" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Expenses")}><BadgeIndianRupee size={15} /> Expenses</button>
                      <button className={financeView === "Bank Accounts" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Bank Accounts")}><CreditCard size={15} /> Bank accounts</button>
                      <button className={financeView === "Vendor Payments" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Vendor Payments")}><BadgeIndianRupee size={15} /> Vendor payments</button>
                      <button className={financeView === "Journal Entries" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Journal Entries")}><ClipboardList size={15} /> Journal entries</button>
                      <button className={financeView === "General Ledger" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("General Ledger")}><BookOpen size={15} /> General ledger</button>
                      <button className={financeView === "Finance Reports" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openFinanceView("Finance Reports")}><FileBarChart size={15} /> Finance reports</button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button key={item.id} className={activeModule === item.id ? "nav active" : "nav"} onClick={() => openModule(item.id)} title={item.label}>
                <Icon size={18} />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
          <button className="nav sidebar-logout" onClick={handleLogout} title="Logout">
            <LogOut size={18} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
              {sidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}
            </button>
            <div>
              <p>{storeLabel(activeStore)}</p>
        <h1>{activeModule === "attendance" ? `Attendance - ${attendanceView}` : activeModule === "finance" ? `Finance - ${financeView}` : modules.find((item) => item.id === activeModule)?.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={online ? "pill online" : "pill offline"}>{online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? "Online" : "Offline"}{queuedOrders ? ` - ${queuedOrders}` : ""}</span>
            {canManageAll ? (
              <>
                <button className="store-list-btn store-back-btn" onClick={backToStores} title="Back to all stores"><Store size={16} />Back to stores</button>
                <select className="store-switcher" value={activeStore.id} onChange={(event) => { setSelectedStoreId(event.target.value); notify("Store view changed"); }}>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name} - {store.branch}</option>)}
                </select>
              </>
            ) : <span className="pill store-pill">{activeStore.branch} store</span>}
            <span className="pill role-pill">{currentRoleLabel}</span>
            <button className="icon-btn" onClick={() => notify("No new notifications")} title="Notifications"><Bell size={18} /></button>
            <button className="icon-btn" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-btn" onClick={handleLogout} title="Logout"><LogOut size={18} /></button>
          </div>
        </header>
        {content}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [portal, setPortal] = useState("restaurant");
  const [authMode, setAuthMode] = useState("password");
  const [email, setEmail] = useState("super@vestora.test");
  const [password, setPassword] = useState("Super@123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function login(event) {
    event.preventDefault();
    const loginId = email.trim().toLowerCase();
    const savedUsers = loadStoredArray("vestora-users");
    const restaurantAccounts = [
      ...savedUsers.map((user) => ({
        id: user.id,
        email: String(user.email || "").trim().toLowerCase(),
        password: String(user.password || ""),
        name: user.name,
        role: roleToAuthRole(user.role),
        appRole: user.role,
        status: user.status || "Active",
        storeId: user.storeId || "STORE-001",
      })),
      ...demoAccounts,
    ];
    const user = portal === "supplier"
      ? supplierAccounts.find((account) => (account.email === loginId || account.mobile === email.trim()) && (authMode === "otp" ? account.otp === password : account.password === password))
      : restaurantAccounts.find((account) => account.email?.toLowerCase() === loginId && account.password === password && account.status !== "Inactive" && account.status !== "Suspended");
    if (!user) {
      setError("Invalid login");
      return;
    }
    onLogin(user);
  }

  function choosePortal(nextPortal) {
    setPortal(nextPortal);
    setAuthMode("password");
    setError("");
    if (nextPortal === "supplier") {
      setEmail("supplier@freshfarm.test");
      setPassword("Supplier@123");
    } else {
      setEmail("super@vestora.test");
      setPassword("Super@123");
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={login}>
        <img src={vestoraLogoPath} alt="" />
        <h1>VESTORA</h1>
        <p>{portal === "supplier" ? "Supplier Purchase Order Portal" : "Restaurant staff login"}</p>
        <div className="login-tabs">
          <button type="button" className={portal === "restaurant" ? "active-action" : ""} onClick={() => choosePortal("restaurant")}>Restaurant</button>
          <button type="button" className={portal === "supplier" ? "active-action" : ""} onClick={() => choosePortal("supplier")}>Supplier</button>
        </div>
        {portal === "supplier" && (
          <div className="login-tabs compact">
            <button type="button" className={authMode === "password" ? "active-action" : ""} onClick={() => { setAuthMode("password"); setPassword("Supplier@123"); }}>Password</button>
            <button type="button" className={authMode === "otp" ? "active-action" : ""} onClick={() => { setAuthMode("otp"); setPassword("123456"); }}>OTP</button>
          </div>
        )}
        <label>{portal === "supplier" ? "Email or mobile" : "Email"}<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>{authMode === "otp" ? "OTP" : "Password"}
          <span className="password-field">
            <input value={password} type={showPassword ? "text" : "password"} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? `Hide ${authMode}` : `Show ${authMode}`}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {error && <strong className="login-error">{error}</strong>}
        <button className="login-submit" type="submit">Login</button>
        <div className="demo-logins">
          {portal === "supplier" ? (
            <>
              <button type="button" onClick={() => { setEmail("supplier@freshfarm.test"); setPassword(authMode === "otp" ? "123456" : "Supplier@123"); }}>Supplier Demo</button>
              <button type="button" onClick={() => { setEmail("9876543210"); setPassword("123456"); setAuthMode("otp"); }}>Mobile OTP</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setEmail("super@vestora.test"); setPassword("Super@123"); }}>Super Admin</button>
              <button type="button" onClick={() => { setEmail("admin@vestora.test"); setPassword("Admin@123"); }}>Admin</button>
            </>
          )}
        </div>
        <div className="login-credentials">
          {portal === "supplier" ? (
            <>
              <small>Supplier: supplier@freshfarm.test / Supplier@123</small>
              <small>Mobile OTP: 9876543210 / 123456</small>
            </>
          ) : (
            <>
              <small>Super: super@vestora.test / Super@123</small>
              <small>Admin: admin@vestora.test / Admin@123</small>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function SuperAdminStoreLanding({ stores, setStores, activeStore, onEnterStore, onLogout, notify, toast }) {
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [storeFormMode, setStoreFormMode] = useState("store");
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [branchReturnStoreId, setBranchReturnStoreId] = useState(null);
  const emptyStoreDraft = {
    name: "",
    parentName: stores[0]?.name || "",
    legalName: "",
    branch: "",
    branchCode: "",
    owner: "",
    adminEmail: "",
    adminMobile: "",
    phone: "",
    email: "",
    gst: "",
    fssai: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    counterCode: "",
    hours: "",
    status: "Active",
  };
  const [storeDraft, setStoreDraft] = useState(emptyStoreDraft);
  const [newBranchDrafts, setNewBranchDrafts] = useState([]);
  const editingStore = editingStoreId ? stores.find((store) => store.id === editingStoreId) : null;
  const editingStoreBranches = editingStore && storeFormMode === "store"
    ? stores.filter((store) => store.name === editingStore.name && (editingStore.type === "Store" && !editingStore.branch ? store.id !== editingStore.id : true))
    : [];
  const restaurantNames = [...new Set(stores.map((store) => store.name).filter(Boolean))];
  const restaurantGroups = restaurantNames.map((name) => {
    const locations = stores.filter((store) => store.name === name);
    const head = locations.find((store) => store.type === "Store") || locations[0];
    const branches = head?.type === "Store" && !head.branch ? locations.filter((store) => store.id !== head.id) : locations;
    return { name, head, branches };
  });

  function saveStore() {
    const storeName = storeFormMode === "branch" ? storeDraft.parentName : storeDraft.name;
    const parentStore = stores.find((store) => store.name === storeName);
    if (!storeName.trim() || !storeDraft.address.trim() || (storeFormMode === "branch" && !storeDraft.branch.trim()) || newBranchDrafts.some((branch) => !branch.branch.trim())) {
      notify(storeFormMode === "branch" ? "Enter restaurant, branch, and address" : "Enter restaurant name and address");
      return;
    }
    const store = {
      id: editingStoreId || `STORE-${Date.now()}`,
      name: storeName.trim(),
      parentStoreId: storeFormMode === "branch" ? parentStore?.parentStoreId || parentStore?.id || "" : "",
      legalName: storeDraft.legalName.trim() || parentStore?.legalName || "",
      branch: storeDraft.branch.trim(),
      branchCode: storeDraft.branchCode.trim(),
      owner: storeDraft.owner.trim() || "Restaurant Admin",
      adminEmail: storeDraft.adminEmail.trim(),
      adminMobile: storeDraft.adminMobile.trim(),
      phone: storeDraft.phone.trim() || parentStore?.phone || "",
      email: storeDraft.email.trim() || parentStore?.email || "",
      gst: storeDraft.gst.trim() || parentStore?.gst || "",
      fssai: storeDraft.fssai.trim() || parentStore?.fssai || "",
      address: storeDraft.address.trim(),
      city: storeDraft.city.trim(),
      state: storeDraft.state.trim(),
      pincode: storeDraft.pincode.trim(),
      counterCode: storeDraft.counterCode.trim(),
      hours: storeDraft.hours.trim(),
      type: storeFormMode === "branch" ? "Branch" : "Store",
      status: storeDraft.status,
    };
    if (editingStoreId) {
      const previousName = editingStore?.name || store.name;
      setStores((current) => current.map((currentStore) => {
        if (storeFormMode === "store" && currentStore.name === previousName) {
          const restaurantFields = {
            name: store.name,
            legalName: store.legalName,
            phone: store.phone,
            email: store.email,
            gst: store.gst,
            fssai: store.fssai,
            status: store.status,
          };
          return currentStore.id === editingStoreId ? { ...currentStore, ...store, ...restaurantFields, type: currentStore.type || "Store" } : { ...currentStore, ...restaurantFields };
        }
        if (currentStore.id === editingStoreId) return { ...currentStore, ...store };
        return currentStore;
      }));
      if (storeFormMode === "branch" && branchReturnStoreId) {
        const parentStore = stores.find((item) => item.id === branchReturnStoreId);
        if (parentStore) {
          setBranchReturnStoreId(null);
          editStore(parentStore);
          notify(`${store.name} ${store.branch} updated`);
          return;
        }
      }
      setStoreDraft(emptyStoreDraft);
      setEditingStoreId(null);
      setShowStoreForm(false);
      notify(`${store.name} ${storeFormMode === "branch" ? store.branch : "store"} updated`);
      return;
    }
    const branches = newBranchDrafts.map((branch, index) => ({
      id: `BRANCH-${Date.now()}-${index + 1}`,
      name: store.name,
      parentStoreId: store.id,
      legalName: store.legalName,
      branch: branch.branch.trim(),
      branchCode: branch.branchCode.trim(),
      owner: branch.owner.trim() || store.owner,
      adminEmail: "",
      adminMobile: branch.adminMobile.trim() || store.adminMobile,
      phone: branch.phone.trim() || store.phone,
      email: store.email,
      gst: store.gst,
      fssai: store.fssai,
      address: branch.address.trim() || store.address,
      city: branch.city.trim() || store.city,
      state: branch.state.trim() || store.state,
      pincode: branch.pincode.trim() || store.pincode,
      counterCode: branch.counterCode.trim(),
      hours: branch.hours.trim() || store.hours,
      type: "Branch",
      status: branch.status,
    }));
    setStores((current) => branches.length ? [...branches, store, ...current] : [store, ...current]);
    if (storeFormMode === "branch" && branchReturnStoreId) {
      const parentStore = stores.find((item) => item.id === branchReturnStoreId);
      if (parentStore) {
        setBranchReturnStoreId(null);
        editStore(parentStore);
        notify(`${store.branch} created`);
        return;
      }
    }
    setStoreDraft(emptyStoreDraft);
    setNewBranchDrafts([]);
    setShowStoreForm(false);
    notify(branches.length ? `${store.name} and ${branches.length} branch${branches.length === 1 ? "" : "es"} created` : `${store.name} created`);
  }

  function addBranchToNewStore() {
    setNewBranchDrafts((current) => [...current, {
      draftKey: `new-branch-${Date.now()}-${current.length}`,
      branch: "",
      branchCode: "",
      owner: storeDraft.owner,
      adminMobile: storeDraft.adminMobile,
      phone: storeDraft.phone,
      address: storeDraft.address,
      city: storeDraft.city,
      state: storeDraft.state,
      pincode: storeDraft.pincode,
      counterCode: "",
      hours: storeDraft.hours,
      status: storeDraft.status,
    }]);
  }

  function openStoreForm(mode) {
    setStoreFormMode(mode);
    setEditingStoreId(null);
    setBranchReturnStoreId(null);
    setStoreDraft({ ...emptyStoreDraft, parentName: stores[0]?.name || "" });
    setNewBranchDrafts([]);
    setShowStoreForm(true);
  }

  function openBranchForm(parentName, returnStoreId = null) {
    setStoreFormMode("branch");
    setEditingStoreId(null);
    setBranchReturnStoreId(returnStoreId);
    setStoreDraft({ ...emptyStoreDraft, parentName });
    setNewBranchDrafts([]);
    setShowStoreForm(true);
  }

  function draftFromStore(store, mode = store?.type === "Branch" ? "branch" : "store") {
    return {
      name: store?.name || "",
      parentName: store?.name || stores[0]?.name || "",
      legalName: store?.legalName || "",
      branch: store?.branch || "",
      branchCode: store?.branchCode || "",
      owner: store?.owner || "",
      adminEmail: store?.adminEmail || "",
      adminMobile: store?.adminMobile || "",
      phone: store?.phone || "",
      email: store?.email || store?.adminEmail || "",
      gst: store?.gst || "",
      fssai: store?.fssai || "",
      address: store?.address || "",
      city: store?.city || "",
      state: store?.state || "",
      pincode: store?.pincode || "",
      counterCode: store?.counterCode || "",
      hours: store?.hours || "",
      status: store?.status || "Active",
    };
  }

  function editStore(store) {
    setStoreFormMode("store");
    setEditingStoreId(store.id);
    setBranchReturnStoreId(null);
    setStoreDraft(draftFromStore(store, "store"));
    setNewBranchDrafts([]);
    setShowStoreForm(true);
  }

  function editBranch(store, returnStoreId = null) {
    setStoreFormMode("branch");
    setEditingStoreId(store.id);
    setBranchReturnStoreId(returnStoreId);
    setStoreDraft(draftFromStore(store, "branch"));
    setNewBranchDrafts([]);
    setShowStoreForm(true);
  }

  function closeStoreForm() {
    setStoreDraft(emptyStoreDraft);
    setEditingStoreId(null);
    setBranchReturnStoreId(null);
    setNewBranchDrafts([]);
    setShowStoreForm(false);
  }

  function deleteBranch(store) {
    if (!window.confirm(`Delete ${store.branch}? This cannot be undone.`)) return;
    setStores((current) => current.filter((item) => item.id !== store.id));
    notify(`${store.branch} branch deleted`);
  }

  function deleteRestaurant(group) {
    if (!window.confirm(`Delete ${group.name} and all ${group.branches.length} branch${group.branches.length === 1 ? "" : "es"}? This cannot be undone.`)) return;
    setStores((current) => current.filter((store) => store.name !== group.name));
    notify(`${group.name} store deleted`);
  }

  return (
    <div className="super-admin-landing">
      <header className="super-admin-landing-head">
        <div className="super-admin-brand">
          <img src={vestoraLogoPath} alt="" />
          <div>
            <strong>VESTORA</strong>
            <span>Super Admin Store Access</span>
          </div>
        </div>
        <div className="super-admin-actions">
          <span className="pill role-pill">Super Admin</span>
          <button className="icon-btn" onClick={onLogout} title="Logout"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="super-admin-main">
        {!showStoreForm && <>
        <div className="super-admin-title-row">
          <div>
            <p>Platform directory</p>
            <h1>Stores and branches</h1>
          </div>
          <div className="super-admin-title-actions">
            <button className="create-store-btn" onClick={() => showStoreForm && storeFormMode === "store" ? closeStoreForm() : openStoreForm("store")}>{showStoreForm && storeFormMode === "store" ? "Close" : "New restaurant"}</button>
          </div>
        </div>

        <section className="super-admin-overview" aria-label="Store directory overview">
          <div>
            <span className="directory-icon"><Building2 size={20} /></span>
            <span>Restaurants<strong>{restaurantGroups.length}</strong></span>
          </div>
          <div>
            <span className="directory-icon"><Store size={20} /></span>
            <span>Branches<strong>{stores.length}</strong></span>
          </div>
          <div>
            <span className="directory-icon"><ShieldCheck size={20} /></span>
            <span>Active locations<strong>{stores.filter((store) => store.status === "Active").length}</strong></span>
          </div>
        </section>

        <div className="restaurant-store-grid">
          {restaurantGroups.map((group) => (
            <div className="restaurant-store-card" key={group.name}>
                <div className="restaurant-store-head">
                  <div>
                    <div className="restaurant-store-meta"><span className={group.head?.status === "Active" ? "active-chip" : "store-status muted"}>{group.head?.status || "Active"}</span><span>Restaurant</span></div>
                    <strong>{group.name}</strong>
                    <p>{group.branches.length} branch{group.branches.length === 1 ? "" : "es"} in this restaurant</p>
                  </div>
                <div className="restaurant-store-actions">
                  <button type="button" onClick={() => editStore(group.head)}>Edit store</button>
                  <button className="destructive-action" type="button" onClick={() => deleteRestaurant(group)}>Delete store</button>
                </div>
              </div>
              <div className="branch-card-grid">
                {group.branches.map((store) => (
                  <div className={store.id === activeStore.id ? "branch-card active-store-card" : "branch-card"} key={store.id}>
                    <div className="branch-card-title">
                      <span className="branch-location-icon"><Store size={19} /></span>
                      <div><strong>{store.branch}</strong><span>{store.type || "Store branch"}</span></div>
                    </div>
                    <dl>
                      <dt>Branch ID</dt>
                      <dd>{store.id}</dd>
                      <dt>Admin</dt>
                      <dd>{store.owner || "Restaurant Admin"}</dd>
                      <dt>Contact</dt>
                      <dd>{store.phone || store.adminMobile || "Not set"}</dd>
                    </dl>
                    <div className="branch-card-actions">
                      <button type="button" onClick={() => editBranch(store)}>Edit branch</button>
                      <button type="button" onClick={() => onEnterStore(store)}>View branch</button>
                      <button className="destructive-action" type="button" onClick={() => deleteBranch(store)}>Delete</button>
                    </div>
                  </div>
                ))}
                {!group.branches.length && <div className="empty-branch-state">No branches added yet. Open Edit Store to add a branch.</div>}
              </div>
            </div>
          ))}
        </div>
        </>}

        {showStoreForm && (
          <section className="store-editor-view">
            <div className="store-editor-kicker">
              <button type="button" onClick={() => branchReturnStoreId ? editStore(stores.find((store) => store.id === branchReturnStoreId)) : closeStoreForm()}><PanelLeftClose size={17} /> {branchReturnStoreId ? "Back to edit store" : "Back to directory"}</button>
              <span>{storeFormMode === "branch" ? "Branch management" : "Restaurant management"}</span>
            </div>
          <div className="store-create-panel">
            <div className="store-create-head">
              <div>
                <strong>{editingStoreId ? (storeFormMode === "branch" ? "Edit branch" : "Edit store") : (storeFormMode === "branch" ? "Create new branch" : "Add store")}</strong>
                <span>{storeFormMode === "branch" ? "Update the essential branch details." : (editingStoreId ? "Update restaurant details and manage branches." : "Create the restaurant with essential details.")}</span>
              </div>
              {!editingStoreId && storeFormMode === "store" && <button type="button" onClick={addBranchToNewStore}>Add branch</button>}
            </div>
            <div className={storeFormMode === "branch" ? "store-form-grid branch-short-form" : "store-form-grid store-short-form"}>
              {storeFormMode === "branch" ? (
                <label>Restaurant<select value={storeDraft.parentName} onChange={(event) => setStoreDraft((current) => ({ ...current, parentName: event.target.value }))}>{restaurantNames.map((name) => <option key={name}>{name}</option>)}</select></label>
              ) : (
                <label>Restaurant name<input value={storeDraft.name} onChange={(event) => setStoreDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Restaurant name" /></label>
              )}
              <label className="details-extra-field">Legal name<input value={storeDraft.legalName} onChange={(event) => setStoreDraft((current) => ({ ...current, legalName: event.target.value }))} placeholder="Registered business name" /></label>
              <label className={storeFormMode === "store" ? "branch-details-field" : ""}>Branch name<input value={storeDraft.branch} onChange={(event) => setStoreDraft((current) => ({ ...current, branch: event.target.value }))} placeholder="Branch / area" /></label>
              <label className={storeFormMode === "store" ? "branch-details-field" : ""}>Branch code<input value={storeDraft.branchCode} onChange={(event) => setStoreDraft((current) => ({ ...current, branchCode: event.target.value }))} placeholder="IND-001" /></label>
              <label>Owner name<input value={storeDraft.owner} onChange={(event) => setStoreDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Restaurant owner name" /></label>
              <label className={storeFormMode === "branch" ? "branch-extra-field" : ""}>Store email<input value={storeDraft.email} onChange={(event) => setStoreDraft((current) => ({ ...current, email: event.target.value }))} placeholder="store@restaurant.com" /></label>
              <label>Owner number<input value={storeDraft.adminMobile} onChange={(event) => setStoreDraft((current) => ({ ...current, adminMobile: event.target.value }))} placeholder="+91 owner number" /></label>
              <label>Store phone<input value={storeDraft.phone} onChange={(event) => setStoreDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Store contact number" /></label>
              <label className="details-extra-field">Store email<input value={storeDraft.email} onChange={(event) => setStoreDraft((current) => ({ ...current, email: event.target.value }))} placeholder="store@restaurant.com" /></label>
              <label className="details-extra-field">GST number<input value={storeDraft.gst} onChange={(event) => setStoreDraft((current) => ({ ...current, gst: event.target.value }))} placeholder="GSTIN" /></label>
              <label className="details-extra-field">FSSAI number<input value={storeDraft.fssai} onChange={(event) => setStoreDraft((current) => ({ ...current, fssai: event.target.value }))} placeholder="FSSAI license" /></label>
              <label>Address<input value={storeDraft.address} onChange={(event) => setStoreDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Full branch address" /></label>
              <label className="details-extra-field">City<input value={storeDraft.city} onChange={(event) => setStoreDraft((current) => ({ ...current, city: event.target.value }))} placeholder="City" /></label>
              <label className="details-extra-field">State<input value={storeDraft.state} onChange={(event) => setStoreDraft((current) => ({ ...current, state: event.target.value }))} placeholder="State" /></label>
              <label className="details-extra-field">Pincode<input value={storeDraft.pincode} onChange={(event) => setStoreDraft((current) => ({ ...current, pincode: event.target.value }))} placeholder="Pincode" /></label>
              <label className="details-extra-field">Counter code<input value={storeDraft.counterCode} onChange={(event) => setStoreDraft((current) => ({ ...current, counterCode: event.target.value }))} placeholder="POS-01" /></label>
              <label className="details-extra-field">Opening hours<input value={storeDraft.hours} onChange={(event) => setStoreDraft((current) => ({ ...current, hours: event.target.value }))} placeholder="10:00 AM - 11:30 PM" /></label>
              <label>Status<select value={storeDraft.status} onChange={(event) => setStoreDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option><option>Suspended</option></select></label>
            </div>
            {storeFormMode === "store" && editingStoreId && (
              <section className="existing-branches-panel">
                <div className="existing-branches-head"><strong>Existing branches</strong><span>{editingStoreBranches.length} branch{editingStoreBranches.length === 1 ? "" : "es"} in this restaurant</span></div>
                <div className="existing-branch-list">
                  {editingStoreBranches.map((branch) => (
                    <div className="existing-branch-row" key={branch.id}>
                      <div><strong>{branch.branch}</strong><span>{branch.branchCode || "No branch code"}</span></div>
                      <span className={branch.status === "Active" ? "active-chip" : "store-status muted"}>{branch.status || "Active"}</span>
                      <button type="button" onClick={() => editBranch(branch, editingStore?.id || null)}>Edit branch</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {storeFormMode === "store" && editingStoreId && (
              <section className="additional-branches-panel">
                <div className="additional-branches-head">
                  <div><strong>Add a branch</strong><span>Create a branch with its full details.</span></div>
                  <button type="button" onClick={() => openBranchForm(editingStore?.name || "", editingStore?.id || null)}>Add branch</button>
                </div>
              </section>
            )}
            {storeFormMode === "store" && !editingStoreId && newBranchDrafts.map((branch, index) => (
              <section className="new-store-branch-panel" key={branch.draftKey}>
                <div className="additional-branches-head">
                  <div><strong>Branch {index + 1} details</strong><span>Add each branch before saving this restaurant.</span></div>
                  <div className="branch-detail-actions">
                    <button type="button" onClick={addBranchToNewStore}>Add another branch</button>
                    <button type="button" className="remove-branch-row" onClick={() => setNewBranchDrafts((current) => current.filter((item) => item.draftKey !== branch.draftKey))}>Cancel branch</button>
                  </div>
                </div>
                <div className="store-form-grid branch-short-form">
                  <label>Branch name<input value={branch.branch} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, branch: event.target.value } : item))} placeholder="Branch / area" /></label>
                  <label>Branch code<input value={branch.branchCode} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, branchCode: event.target.value } : item))} placeholder="IND-001" /></label>
                  <label>Owner name<input value={branch.owner} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, owner: event.target.value } : item))} placeholder="Branch owner name" /></label>
                  <label>Owner number<input value={branch.adminMobile} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, adminMobile: event.target.value } : item))} placeholder="+91 owner number" /></label>
                  <label>Store phone<input value={branch.phone} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, phone: event.target.value } : item))} placeholder="Branch contact number" /></label>
                  <label>Address<input value={branch.address} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, address: event.target.value } : item))} placeholder="Full branch address" /></label>
                  <label>Status<select value={branch.status} onChange={(event) => setNewBranchDrafts((current) => current.map((item) => item.draftKey === branch.draftKey ? { ...item, status: event.target.value } : item))}><option>Active</option><option>Inactive</option><option>Suspended</option></select></label>
                </div>
              </section>
            ))}
            <div className="store-form-actions">
              <button className="primary-table-action" type="button" onClick={saveStore}>{editingStoreId ? "Save changes" : (storeFormMode === "branch" ? "Create branch" : (newBranchDrafts.length ? "Create store & branches" : "Add store"))}</button>
            </div>
          </div>
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SupplierPortal({ currentUser, orders, setOrders, onLogout }) {
  const supplierOrders = orders.filter((order) => order.supplierId === currentUser.id);
  const [activeTab, setActiveTab] = useState("orders");
  const [selectedId, setSelectedId] = useState(supplierOrders[0]?.id || "");
  const [supplierToast, setSupplierToast] = useState("");
  const [documents, setDocuments] = useState([
    ["GST certificate", "Not uploaded"],
    ["FSSAI certificate", "Not uploaded"],
    ["Bank details", "Not uploaded"],
    ["Business license", "Not uploaded"],
    ["Product price list", "Not uploaded"],
  ]);
  const selected = supplierOrders.find((order) => order.id === selectedId) || supplierOrders[0];
  const outstanding = supplierOrders.filter((order) => order.paymentStatus !== "Paid").reduce((sum, order) => sum + poTotal(order), 0);
  const totalBusiness = supplierOrders.reduce((sum, order) => sum + poTotal(order), 0);

  function notifyRestaurant(message) {
    setSupplierToast(message);
    window.clearTimeout(window.vestoraSupplierToastTimer);
    window.vestoraSupplierToastTimer = window.setTimeout(() => setSupplierToast(""), 2600);
  }

  function updateOrder(id, patch, message) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, ...patch } : order));
    if (message) notifyRestaurant(message);
  }

  function updateItem(orderId, itemName, field, value) {
    setOrders((current) => current.map((order) => {
      if (order.id !== orderId) return order;
      return { ...order, items: order.items.map((item) => item.name === itemName ? { ...item, [field]: value } : item) };
    }));
  }

  function uploadDocument(name, fileName) {
    setDocuments((current) => current.map((doc) => doc[0] === name ? [name, fileName || "Uploaded"] : doc));
  }

  const metrics = [
    ["New purchase orders", supplierOrders.filter((order) => order.status === "New").length],
    ["Accepted orders", supplierOrders.filter((order) => order.status === "Accepted").length],
    ["Pending orders", supplierOrders.filter((order) => ["New", "Accepted", "Dispatched"].includes(order.status)).length],
    ["Delivered orders", supplierOrders.filter((order) => order.status === "Delivered").length],
    ["Cancelled orders", supplierOrders.filter((order) => ["Rejected", "Cancelled"].includes(order.status)).length],
    ["Payment pending", formatMoney(outstanding)],
    ["Total business value", formatMoney(totalBusiness)],
  ];

  return (
    <div className="supplier-app">
      <header className="supplier-topbar">
        <div className="supplier-brand"><img src={vestoraLogoPath} alt="" /><div><strong>VESTORA Supplier Portal</strong><span>{currentUser.name}</span></div></div>
        <div className="supplier-actions"><span className="pill role-pill">Supplier</span><button className="icon-btn" onClick={onLogout} title="Logout"><LogOut size={18} /></button></div>
      </header>
      <main className="supplier-main">
        <section className="supplier-hero">
          <div><p>Purchase orders assigned to your supplier account only</p><h1>Supplier Dashboard</h1></div>
          <div className="supplier-tabs">{["orders", "payments", "documents", "reports"].map((tab) => <button key={tab} className={activeTab === tab ? "active-action" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
        </section>
        <div className="metric-grid compact supplier-metrics">
          {metrics.map(([label, value]) => <Metric key={label} icon={label.includes("Payment") ? BadgeIndianRupee : Truck} label={label} value={String(value)} />)}
        </div>
        {activeTab === "orders" && (
          <section className="supplier-layout">
            <div className="panel supplier-list">
              <PanelHead title="Purchase orders" icon={ClipboardList} actions={["Refresh"]} onAction={() => notifyRestaurant("Supplier checked purchase orders")} />
              {supplierOrders.map((order) => (
                <button key={order.id} className={selected?.id === order.id ? "supplier-order active-module" : "supplier-order"} onClick={() => setSelectedId(order.id)}>
                  <span><strong>{order.id}</strong><small>{order.restaurant} - {order.branch}</small></span>
                  <em>{order.status}</em>
                  <b>{formatMoney(poTotal(order))}</b>
                </button>
              ))}
            </div>
            {selected && <SupplierOrderDetails order={selected} updateOrder={updateOrder} updateItem={updateItem} />}
          </section>
        )}
        {activeTab === "payments" && <SupplierPayments orders={supplierOrders} outstanding={outstanding} />}
        {activeTab === "documents" && <SupplierDocuments documents={documents} uploadDocument={uploadDocument} />}
        {activeTab === "reports" && <SupplierReports orders={supplierOrders} />}
      </main>
      {supplierToast && <div className="toast">{supplierToast}</div>}
    </div>
  );
}

function SupplierOrderDetails({ order, updateOrder, updateItem }) {
  const [rejectReason, setRejectReason] = useState(order.rejectReason);
  const [remarks, setRemarks] = useState(order.remarks);

  return (
    <div className="panel supplier-detail">
      <PanelHead title={order.id} icon={ReceiptText} actions={["Accept", "Reject", "Dispatch", "Deliver"]} onAction={(action) => {
        if (action === "Accept") updateOrder(order.id, { status: "Accepted" }, `${order.id} accepted by supplier`);
        if (action === "Reject") updateOrder(order.id, { status: "Rejected", rejectReason: rejectReason || "Stock unavailable" }, `${order.id} rejected by supplier`);
        if (action === "Dispatch") updateOrder(order.id, { status: "Dispatched" }, `${order.id} dispatched by supplier`);
        if (action === "Deliver") updateOrder(order.id, { status: "Delivered" }, `${order.id} delivered by supplier`);
      }} />
      <div className="po-summary">
        <span>Restaurant <strong>{order.restaurant}</strong></span>
        <span>Branch <strong>{order.branch}</strong></span>
        <span>Order date <strong>{order.orderDate}</strong></span>
        <span>Delivery date <strong>{order.deliveryDate}</strong></span>
        <span>Payment <strong>{order.paymentStatus}</strong></span>
        <span>Total <strong>{formatMoney(poTotal(order))}</strong></span>
      </div>
      <div className="po-address"><strong>Delivery address</strong><span>{order.address}</span><span>{order.contact}</span></div>
      <div className="supplier-table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Tax</th><th>Availability</th><th>Total</th></tr></thead>
          <tbody>{order.items.map((item) => {
            const lineTotal = item.availableQuantity * item.rate + Math.round((item.availableQuantity * item.rate * item.tax) / 100);
            return (
              <tr key={item.name}>
                <td>{item.name}</td>
                <td><input className="mini-input" type="number" value={item.availableQuantity} onChange={(event) => updateItem(order.id, item.name, "availableQuantity", Number(event.target.value))} /> / {item.quantity}</td>
                <td>{item.unit}</td>
                <td>{formatMoney(item.rate)}</td>
                <td>{item.tax}%</td>
                <td><select value={item.available} onChange={(event) => updateItem(order.id, item.name, "available", event.target.value)}><option>Available</option><option>Partial</option><option>Not available</option></select></td>
                <td>{formatMoney(lineTotal)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="supplier-form-grid">
        <label>Expected delivery date<input type="date" value={order.expectedDelivery} onChange={(event) => updateOrder(order.id, { expectedDelivery: event.target.value }, `${order.id} delivery date updated`)} /></label>
        <label>Reject reason<input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Required when rejecting" /></label>
        <label>Invoice / bill upload<input type="file" onChange={(event) => updateOrder(order.id, { invoice: event.target.files?.[0]?.name || order.invoice }, `${order.id} invoice uploaded`)} /></label>
        <label>Remarks<input value={remarks} onChange={(event) => setRemarks(event.target.value)} onBlur={() => updateOrder(order.id, { remarks }, `${order.id} remarks updated`)} /></label>
      </div>
    </div>
  );
}

function SupplierPayments({ orders, outstanding }) {
  const rows = orders.map((order) => [order.id, order.paymentStatus, formatMoney(poTotal(order)), order.invoice || "Invoice pending"]);
  return <section className="panel supplier-wide"><PanelHead title="Supplier payments" icon={BadgeIndianRupee} /><div className="metric-grid compact"><Metric icon={BadgeIndianRupee} label="Outstanding balance" value={formatMoney(outstanding)} /><Metric icon={ReceiptText} label="Pending invoices" value={String(orders.filter((order) => order.paymentStatus === "Pending").length)} /><Metric icon={CreditCard} label="Partially paid" value={String(orders.filter((order) => order.paymentStatus === "Partially paid").length)} /></div><SimpleTable columns={["PO", "Payment status", "Amount", "Invoice"]} rows={rows} /></section>;
}

function SupplierDocuments({ documents, uploadDocument }) {
  return <section className="panel supplier-wide"><PanelHead title="Supplier documents" icon={Upload} /><div className="document-grid">{documents.map(([name, status]) => <label key={name} className="document-card"><strong>{name}</strong><span>{status}</span><input type="file" onChange={(event) => uploadDocument(name, event.target.files?.[0]?.name)} /></label>)}</div></section>;
}

function SupplierReports({ orders }) {
  const itemRows = orders.flatMap((order) => order.items.map((item) => [item.name, order.id, `${item.availableQuantity} ${item.unit}`, formatMoney(item.availableQuantity * item.rate)]));
  return <section className="panel supplier-wide"><PanelHead title="Supplier reports" icon={FileBarChart} actions={["Order history", "Item-wise", "Payment", "Monthly"]} /><SimpleTable columns={["Item", "PO", "Supplied qty", "Value"]} rows={itemRows} /></section>;
}

function SimpleTable({ columns, rows }) {
  return <div className="supplier-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.join("-")}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function ExcelReportSheet({ title, range, columns, rows, columnTotals = {} }) {
  const visibleRows = rows.length ? rows : [columns.map((_, index) => (index === 0 ? "No records found" : ""))];
  return (
    <div className="excel-report-shell">
      <div className="excel-commandbar">
        <span>Workbook</span>
        <strong>{title}</strong>
        <em>{range}</em>
      </div>
      <div className="excel-formula-row">
        <span className="name-box">A1</span>
        <span className="formula-label">fx</span>
        <strong>{title} report for {range}</strong>
      </div>
      <div className="excel-grid-wrap">
        <table className="excel-grid">
          <thead>
            <tr>
              <th className="excel-corner"></th>
              {columns.map((column, index) => <th key={`${column}-letter`}>{columnLetter(index)}</th>)}
            </tr>
            <tr>
              <th className="excel-row-number">1</th>
              {columns.map((column) => <th key={column} className="excel-column-name">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}-${row.join("-")}`}>
                <th className="excel-row-number">{rowIndex + 2}</th>
                {columns.map((column, cellIndex) => (
                  <td key={`${column}-${cellIndex}`} className={cellIndex === 0 ? "excel-cell-primary" : ""}>{row[cellIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="excel-total-row">
              <th className="excel-row-number">{visibleRows.length + 2}</th>
              {columns.map((column, cellIndex) => <td key={`${column}-total`} className={cellIndex === 0 ? "excel-cell-primary" : ""}>{columnTotals[cellIndex] ?? ""}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="excel-statusbar">
        <span>{visibleRows.length} rows</span>
        <span>{columns.length} columns</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function Dashboard({ notify, salesLedger, refundLedger = [], kdsOrders, comparisonStores = [], comparisonSalesLedger = [], storeId, onNavigate }) {
  const [range, setRange] = useState("Weekly");
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState(new Date());
  const [inventorySnapshot, setInventorySnapshot] = useState(() => {
    const saved = loadStoredArray(`vestora-inventory-${storeId}`);
    return stripUntouchedDefaultRecords(saved, defaultInventoryItems, ["updatedAt"]);
  });
  useEffect(() => {
    const saved = loadStoredArray(`vestora-inventory-${storeId}`);
    setInventorySnapshot(stripUntouchedDefaultRecords(saved, defaultInventoryItems, ["updatedAt"]));
    setAnalysisUpdatedAt(new Date());
  }, [storeId]);
  const todayLedger = salesLedger.filter((bill) => isTodayDate(bill.createdAt));
  const ledgerSales = todayLedger.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const ledgerOrders = todayLedger.length;
  const liveKitchenOrders = kdsOrders.filter((order) => order.status !== "Completed");
  const readyKitchenOrders = kdsOrders.filter((order) => order.status === "Ready");
  const todayRefunds = refundLedger.filter((refund) => isTodayDate(refund.createdAt)).reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const todaySales = ledgerSales - todayRefunds;
  const todayOrders = ledgerOrders;
  const currentDay = new Date().toLocaleDateString("en-US", { weekday: "short" });
  const dynamicSalesGraph = salesGraph.map((day) => ({ ...day, sales: day.day === currentDay ? todaySales : 0, orders: day.day === currentDay ? todayOrders : 0 }));
  const orderMix = Object.entries(todayLedger.reduce((mix, bill) => ({ ...mix, [bill.orderType]: (mix[bill.orderType] || 0) + 1 }), { "Dine-in": 0, Takeaway: 0, Delivery: 0, Online: 0 }));
  const paymentCounts = todayLedger.reduce((mix, bill) => ({ ...mix, [bill.payment]: (mix[bill.payment] || 0) + 1 }), { UPI: 0, Card: 0, Cash: 0, Credit: 0, Wallet: 0, Split: 0 });
  const paymentActivityTotal = Object.values(paymentCounts).reduce((sum, value) => sum + value, 0);
  const paymentTotal = paymentActivityTotal || 1;
  const paymentMix = Object.entries(paymentCounts).filter(([, value]) => value > 0).map(([label, value]) => [label, Math.round((value / paymentTotal) * 100)]);
  const comparisonTodayLedger = comparisonSalesLedger.filter((bill) => isTodayDate(bill.createdAt));
  const branchComparison = comparisonStores.map((store) => {
    const branchSales = comparisonTodayLedger
      .filter((bill) => normalizeStoreId(bill.storeId) === store.id)
      .reduce((sum, bill) => sum + Number(bill.total || 0), 0);
    return [store.branch || store.name, branchSales];
  });
  const latestBill = todayLedger[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySales = salesLedger
    .filter((bill) => localDateKey(bill.createdAt) === localDateKey(yesterday))
    .reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const yesterdayRefunds = refundLedger
    .filter((refund) => localDateKey(refund.createdAt) === localDateKey(yesterday))
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const netYesterdaySales = yesterdaySales - yesterdayRefunds;
  const salesChange = netYesterdaySales ? Math.round(((todaySales - netYesterdaySales) / netYesterdaySales) * 100) : null;
  const averageOrderValue = todayOrders ? Math.round(todaySales / todayOrders) : 0;
  const itemDemand = todayLedger.flatMap((bill) => bill.items || []).reduce((totals, item) => {
    totals[item.name] = (totals[item.name] || 0) + Number(item.qty || 0);
    return totals;
  }, {});
  const topItem = Object.entries(itemDemand).sort((a, b) => b[1] - a[1])[0] || null;
  const dominantPayment = Object.entries(paymentCounts).sort((a, b) => b[1] - a[1])[0];
  const lowStockItems = inventorySnapshot.filter((item) => Number(item.stock || 0) <= Number(item.reorder || 0));
  const operationalScore = Math.max(48, Math.min(98, 94 - Math.min(24, liveKitchenOrders.length * 4) - Math.min(24, lowStockItems.length * 6) + (todayOrders ? 4 : 0)));
  const healthLabel = operationalScore >= 85 ? "Operating smoothly" : operationalScore >= 70 ? "Monitor priorities" : "Action required";
  const kitchenClearance = liveKitchenOrders.length ? `${Math.max(8, liveKitchenOrders.length * 6)} min` : "Clear";
  const insightCards = [
    {
      id: "revenue",
      icon: BadgeIndianRupee,
      eyebrow: "Revenue pulse",
      title: todayOrders ? `${formatMoney(averageOrderValue)} average order value` : "No completed sales yet",
      text: salesChange === null ? `${todayOrders} order${todayOrders === 1 ? "" : "s"} recorded today. More history will enable day-over-day comparison.` : `Revenue is ${Math.abs(salesChange)}% ${salesChange >= 0 ? "above" : "below"} yesterday at this time.`,
      metric: formatMoney(todaySales),
      confidence: todayOrders >= 5 ? 94 : 78,
      tone: salesChange !== null && salesChange < 0 ? "warning" : "positive",
      module: "reports",
      action: "Open sales report",
    },
    {
      id: "kitchen",
      icon: ChefHat,
      eyebrow: "Kitchen flow",
      title: liveKitchenOrders.length ? `${liveKitchenOrders.length} active ticket${liveKitchenOrders.length === 1 ? "" : "s"}` : "Kitchen queue is clear",
      text: readyKitchenOrders.length ? `${readyKitchenOrders.length} order${readyKitchenOrders.length === 1 ? " is" : "s are"} ready for service. Estimated queue clearance is ${kitchenClearance}.` : `No ready-order backlog. Estimated queue clearance is ${kitchenClearance}.`,
      metric: `${readyKitchenOrders.length} ready`,
      confidence: 97,
      tone: liveKitchenOrders.length > 5 ? "warning" : "neutral",
      module: "kds",
      action: "Open KDS",
    },
    {
      id: "demand",
      icon: PackageSearch,
      eyebrow: "Demand & stock",
      title: lowStockItems.length ? `${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"} below reorder level` : "Stock levels are healthy",
      text: lowStockItems.length ? `${lowStockItems.slice(0, 2).map((item) => item.name).join(" and ")} should be reviewed before the next service window.` : `${topItem ? `${topItem[0]} leads demand with ${topItem[1]} sold.` : "No item demand recorded yet."}`,
      metric: topItem ? `${topItem[1]} sold` : "Live stock",
      confidence: 91,
      tone: lowStockItems.length ? "danger" : "positive",
      module: "inventory",
      action: "Review inventory",
    },
    {
      id: "payment",
      icon: CreditCard,
      eyebrow: "Payment pattern",
      title: paymentActivityTotal ? `${dominantPayment[0]} is the leading method` : "Waiting for payment activity",
      text: paymentActivityTotal ? `${dominantPayment[0]} represents ${Math.round((dominantPayment[1] / paymentTotal) * 100)}% of today's completed payments.` : "Payment recommendations will appear after bills are completed.",
      metric: paymentActivityTotal ? `${Math.round((dominantPayment[1] / paymentTotal) * 100)}% share` : "No mix yet",
      confidence: todayOrders >= 5 ? 90 : 72,
      tone: "neutral",
      module: "finance",
      action: "Open finance",
    },
  ];
  const priorityInsight = lowStockItems.length ? insightCards[2] : liveKitchenOrders.length > 5 ? insightCards[1] : todayOrders ? insightCards[0] : insightCards[1];
  const PriorityIcon = priorityInsight.icon;
  const refreshInsights = () => {
    const saved = loadStoredArray(`vestora-inventory-${storeId}`);
    setInventorySnapshot(stripUntouchedDefaultRecords(saved, defaultInventoryItems, ["updatedAt"]));
    setAnalysisUpdatedAt(new Date());
    notify("AI insights updated from live branch data");
  };
  const openInsight = (insight) => {
    onNavigate?.(insight.module);
    notify(insight.action);
  };
  return (
    <section className="screen">
      <div className="metric-grid">
        <Metric icon={BadgeIndianRupee} label="Today's sales" value={formatMoney(todaySales)} trend={ledgerOrders ? `${ledgerOrders} bills today` : "New day restart"} />
        <Metric icon={ReceiptText} label="Today's orders" value={String(todayOrders)} trend={ledgerOrders ? "POS bills today" : "No bills after midnight"} />
        <Metric icon={ChefHat} label="Live kitchen" value={String(liveKitchenOrders.length)} trend={`${readyKitchenOrders.length} ready`} />
        <Metric icon={PackageSearch} label="Low stock" value={String(lowStockItems.length)} trend={lowStockItems.length ? "Needs review" : "Stock healthy"} danger={lowStockItems.length > 0} />
      </div>
      <div className="split dashboard-intelligence-grid">
        <div className="panel large">
          <PanelHead title={`Sales analytics - ${range}`} icon={Gauge} actions={["Weekly", "Monthly", "Yearly"]} activeAction={range} onAction={(action) => { setRange(action); notify(`${action} analytics loaded`); }} />
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={dynamicSalesGraph}>
              <defs><linearGradient id="sales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22745e" stopOpacity={0.34} /><stop offset="95%" stopColor="#22745e" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Area type="monotone" dataKey="sales" stroke="#22745e" fill="url(#sales)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel ai-copilot-panel">
          <div className="ai-copilot-head">
            <div className="ai-copilot-title"><span><Sparkles size={19} /></span><div><small>Decision intelligence</small><h2>AI insights</h2></div></div>
            <button type="button" onClick={refreshInsights}><Sparkles size={15} /> Refresh</button>
          </div>
          <div className="ai-health-strip">
            <div className={`ai-health-score ${operationalScore < 70 ? "danger" : operationalScore < 85 ? "warning" : ""}`}><strong>{operationalScore}</strong><span>/100</span></div>
            <div><small>Operational health</small><strong>{healthLabel}</strong><p>Sales, kitchen load, and stock risk combined.</p></div>
            <span className="ai-live-pill"><i /> Live</span>
          </div>
          <div className={`ai-priority ${priorityInsight.tone}`}>
            <span><PriorityIcon size={19} /></span>
            <div><small>Recommended next action</small><strong>{priorityInsight.title}</strong><p>{priorityInsight.text}</p></div>
            <button type="button" onClick={() => openInsight(priorityInsight)}>{priorityInsight.action}<ChevronRight size={16} /></button>
          </div>
          <div className="ai-insight-grid">
            {insightCards.map((insight) => {
              const Icon = insight.icon;
              return <button className={`ai-insight-card ${insight.tone}`} type="button" key={insight.id} onClick={() => openInsight(insight)}>
                <span className="ai-insight-card-icon"><Icon size={18} /></span>
                <span className="ai-insight-card-copy"><small>{insight.eyebrow}</small><strong>{insight.title}</strong><em>{insight.text}</em></span>
                <span className="ai-insight-card-meta"><b>{insight.metric}</b><small>{insight.confidence}% confidence</small><ChevronRight size={16} /></span>
              </button>;
            })}
          </div>
          <div className="ai-copilot-foot"><span>Updated {analysisUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span><span>Based on live branch operations</span></div>
        </div>
      </div>
      <div className="ops-grid">
        <StatusBoard title="Order mix" data={orderMix} />
        <StatusBoard title="Branch comparison" data={branchComparison} money />
        <StatusBoard title="Payments" data={paymentMix} percent />
      </div>
    </section>
  );
}

function CashierLogin({ cashiers, activeStore, currentShift, onAuthenticated, onExit, onLogout, onCreateCashier }) {
  const [selectedCashier, setSelectedCashier] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function selectCashier(cashier) {
    setSelectedCashier(cashier);
    setPassword("");
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!selectedCashier) return;
    if (password !== selectedCashier.password) {
      setError("Incorrect password. Try again.");
      return;
    }
    if (onAuthenticated(selectedCashier) === false) {
      setError(`${currentShift?.cashierName || "Another cashier"} has an open shift.`);
    }
  }

  return (
    <section className="cashier-login-screen">
      <div className="cashier-login-card">
        <header className="cashier-login-head">
          <div className="pos-brand-lockup">
            <img src={vestoraLogoPath} alt="" />
            <div><p>VESTORA POS</p><h1>Cashier login</h1></div>
          </div>
          <div className="cashier-login-actions">
            <button type="button" className="cashier-exit-button" onClick={onExit} title="Exit POS"><PanelLeftClose size={18} /><span>Exit POS</span></button>
            <button type="button" className="cashier-exit-button" onClick={onLogout} title="Logout"><LogOut size={18} /><span>Logout</span></button>
          </div>
        </header>

        {!selectedCashier ? (
          <div className="cashier-picker">
            <div className="cashier-picker-copy">
              <span>{activeStore.name} / {activeStore.branch}</span>
              <h2>Select cashier</h2>
              <p>Choose your name to continue to the billing counter.</p>
            </div>
            {cashiers.length ? (
              <div className="cashier-account-grid">
                {cashiers.map((cashier) => {
                  const hasThisShift = currentShift?.cashierId && String(currentShift.cashierId) === String(cashier.id);
                  return (
                    <button type="button" className="cashier-account" key={cashier.id} onClick={() => selectCashier(cashier)}>
                      <span className="cashier-avatar">{cashier.name.trim().slice(0, 1).toUpperCase()}</span>
                      <span><strong>{cashier.name}</strong><small>{hasThisShift ? "Open shift" : "Cashier"}</small></span>
                      <ChevronRight size={19} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cashier-empty-state">
                <UserPlus size={27} />
                <strong>No active cashiers</strong>
                <span>Create a cashier account for this branch before opening POS.</span>
                <button type="button" onClick={onCreateCashier}>Create cashier</button>
              </div>
            )}
          </div>
        ) : (
          <form className="cashier-password-step" onSubmit={submit}>
            <button type="button" className="cashier-change-button" onClick={() => setSelectedCashier(null)}><PanelLeftClose size={16} /> Change cashier</button>
            <span className="cashier-avatar large">{selectedCashier.name.trim().slice(0, 1).toUpperCase()}</span>
            <div className="cashier-password-copy"><span>Cashier</span><h2>{selectedCashier.name}</h2><p>Enter your password to access POS Billing.</p></div>
            <label className="cashier-password-field">
              <span>Password</span>
              <span className="password-field">
                <input value={password} type={showPassword ? "text" : "password"} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="Enter cashier password" autoFocus />
                <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
            {error && <p className="cashier-login-error">{error}</p>}
            <button className="cashier-login-submit" type="submit" disabled={!password}>Continue to POS <ChevronRight size={18} /></button>
          </form>
        )}
      </div>
    </section>
  );
}

function ShiftOpening({ online, onOpenShift, onExit, onLogout, cashier }) {
  const [openingBalance, setOpeningBalance] = useState("0");
  const balance = Number(openingBalance || 0);

  function submit(event) {
    event.preventDefault();
    if (Number.isNaN(balance) || balance < 0) return;
    onOpenShift(balance);
  }

  return (
    <section className="shift-open-screen">
      <form className="shift-card" onSubmit={submit}>
        <div className="shift-card-head">
          <img src={vestoraLogoPath} alt="" />
          <div>
            <p>VESTORA POS</p>
            <h1>Open shift</h1>
            <span className="shift-cashier-name">Cashier: {cashier?.name || "POS User"}</span>
          </div>
          <span className="shift-start-badge">Cash counter</span>
        </div>
        <div className="shift-open-body">
          <div className="shift-cash-display">
            <span className="shift-cash-icon"><BadgeIndianRupee size={23} /></span>
            <div>
              <span>Opening cash</span>
              <strong>{Number.isNaN(balance) ? "Invalid amount" : formatMoney(balance)}</strong>
            </div>
          </div>
          <label className="shift-balance-field">
            <span>Opening balance</span>
            <span className="shift-currency-input"><span>₹</span><input type="number" min="0" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} autoFocus /></span>
          </label>
        </div>
        <div className="shift-actions">
          <span className={online ? "shift-connection online" : "shift-connection offline"}>{online ? <Wifi size={16} /> : <WifiOff size={16} />} {online ? "Online" : "Offline"}</span>
          <div className="shift-secondary-actions">
            <button type="button" onClick={onExit}><PanelLeftClose size={17} /> Exit POS</button>
            <button type="button" onClick={onLogout}><LogOut size={17} /> Logout</button>
          </div>
          <button className="primary-table-action shift-open-button" type="submit" disabled={Number.isNaN(balance) || balance < 0}>Open shift</button>
        </div>
      </form>
    </section>
  );
}

function BillReceiptHeader({ billTemplate }) {
  const logo = billTemplate.logoData || vestoraLogoPath;
  const headerClass = `bill-title ${billTemplate.logoPosition === "Center" ? "centered" : ""} ${billTemplate.layout === "Compact" ? "compact" : ""}`;
  return (
    <div className={headerClass}>
      {billTemplate.showLogo && <img src={logo} alt="" />}
      <div>
        {billTemplate.billTitle && <em>{billTemplate.billTitle}</em>}
        <strong>{billTemplate.restaurantName}</strong>
        {billTemplate.tagline && <small>{billTemplate.tagline}</small>}
        {billTemplate.showAddress !== false && <span>{billTemplate.address}</span>}
        {(billTemplate.showPhone !== false || billTemplate.showEmail) && <span>{[billTemplate.showPhone !== false && billTemplate.phone, billTemplate.showEmail && billTemplate.email].filter(Boolean).join(" | ")}</span>}
        {(billTemplate.showGst !== false || billTemplate.showFssai !== false) && <span>{[billTemplate.showGst !== false && `GST ${billTemplate.gst}`, billTemplate.showFssai !== false && `FSSAI ${billTemplate.fssai}`].filter(Boolean).join(" - ")}</span>}
      </div>
    </div>
  );
}

function BillReceiptFooter({ billTemplate }) {
  return (
    <>
      {billTemplate.showQrBox && <div className="bill-qr-box"><span>QR</span><strong>{billTemplate.qrText || "Scan to pay"}</strong></div>}
      {billTemplate.showTerms !== false && billTemplate.terms && <span className="bill-terms">{billTemplate.terms}</span>}
      {billTemplate.footer && <span>{billTemplate.footer}</span>}
      {billTemplate.copyLabel && <span className="bill-copy-label">{billTemplate.copyLabel}</span>}
    </>
  );
}

function BillReceiptMeta({ billTemplate, rows }) {
  if (billTemplate.showOrderInfo === false) return null;
  const visibleRows = rows.filter(Boolean);
  if (!visibleRows.length) return null;
  return (
    <div className="bill-order-details">
      {visibleRows.map(([label, value]) => <span key={`${label}-${value}`}><small>{label}</small><strong>{value}</strong></span>)}
    </div>
  );
}

function POS({ cart, setCart, items, orderType, setOrderType, online, notify, billTemplate, onSale, onVoidItem, onExit, onLogout, currentShift, onCloseShift, shiftBills, shiftRefunds = [], orderHistory, currentUser, pendingTableOrders = [], onTableOrderPaid }) {
  const catalogItems = (items?.length ? items : menuItems).filter((item) => item.status !== "Inactive");
  const categories = ["All", ...Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean))), "Favourites"];
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [discount, setDiscount] = useState(0);
  const [closingBalance, setClosingBalance] = useState(String(currentShift?.openingBalance || 0));
  const [varianceNote, setVarianceNote] = useState("");
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [showReceptionQueue, setShowReceptionQueue] = useState(false);
  const [selectedReceptionOrderId, setSelectedReceptionOrderId] = useState("");
  const [expandedReceptionOrderId, setExpandedReceptionOrderId] = useState("");
  const [sourceTableOrder, setSourceTableOrder] = useState(null);
  const [showSplitPayment, setShowSplitPayment] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState({ Cash: "", UPI: "", Card: "", Wallet: "", Credit: "" });
  const [completedBill, setCompletedBill] = useState(null);
  const [historyScope, setHistoryScope] = useState("Today");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [recentlyAddedKey, setRecentlyAddedKey] = useState("");
  const billPanelRef = useRef(null);
  const billItemsRef = useRef(null);
  const [orderNumber, setOrderNumber] = useState(() => `ORD-${Date.now().toString().slice(-6)}`);
  const [orderCreatedAt, setOrderCreatedAt] = useState(() => new Date());

  const filtered = catalogItems.filter((item) => {
    const inCategory = category === "All" || item.category === category || (category === "Favourites" && item.fav);
    const searchText = query.trim().toLowerCase();
    const inSearch = !searchText
      || String(item.name || "").toLowerCase().includes(searchText)
      || String(item.category || "").toLowerCase().includes(searchText)
      || String(item.barcode || "").toLowerCase().includes(searchText);
    return inCategory && inSearch;
  });
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const taxableSubtotal = Math.max(subtotal - discount, 0);
  const itemTax = cart.reduce((sum, item) => {
    const rate = Number.isFinite(Number(item.tax)) ? Number(item.tax) : 5;
    return sum + Number(item.price || 0) * Number(item.qty || 0) * (rate / 100);
  }, 0);
  const tax = Math.round(subtotal > 0 ? itemTax * (taxableSubtotal / subtotal) : 0);
  const cgst = Math.round(tax / 2);
  const sgst = tax - cgst;
  const total = Math.max(subtotal - discount, 0) + tax;
  const cartItemCount = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const shiftCashReceipts = shiftBills.reduce((sum, bill) => {
    if (bill.payment === "Cash") return sum + Number(bill.total || 0);
    if (bill.payment === "Split") return sum + Number((bill.splitPayments || []).find((entry) => entry.method === "Cash")?.amount || 0);
    return sum;
  }, 0);
  const shiftCashRefunds = shiftRefunds.reduce((sum, refund) => refund.payment === "Cash" ? sum + Number(refund.amount || 0) : sum, 0);
  const shiftCashSales = Math.round(shiftCashReceipts - shiftCashRefunds);
  const expectedClosingCash = Math.round(Number(currentShift.openingBalance || 0) + shiftCashSales);
  const enteredClosingBalance = Math.round(Number(closingBalance || 0));
  const closingVariance = enteredClosingBalance - expectedClosingCash;
  const needsVarianceNote = !Number.isNaN(enteredClosingBalance) && closingVariance !== 0;
  const varianceNoteValid = varianceNote.trim().length >= 15;
  const visibleHistoryOrders = (orderHistory || []).filter((bill) => {
    if (historyScope === "Today" && !isTodayDate(bill.createdAt)) return false;
    const searchText = [bill.id, bill.orderNumber, bill.cashier, bill.customerName, bill.customerMobile, bill.orderType, bill.payment, ...(bill.items || []).map((item) => item.name)].join(" ").toLowerCase();
    return searchText.includes(historySearch.trim().toLowerCase());
  });
  const selectedHistoryBill = selectedHistoryId ? visibleHistoryOrders.find((bill) => bill.id === selectedHistoryId) || null : null;
  const selectedHistoryTax = Number(selectedHistoryBill?.tax || 0);
  const selectedHistoryCgst = Number(selectedHistoryBill?.cgst ?? Math.round(selectedHistoryTax / 2));
  const selectedHistorySgst = Number(selectedHistoryBill?.sgst ?? selectedHistoryTax - selectedHistoryCgst);
  const selectedReceptionOrder = pendingTableOrders.find((order) => String(order.id) === String(selectedReceptionOrderId)) || null;
  const splitPaidTotal = Object.values(splitAmounts).reduce((sum, amount) => sum + Math.max(Number(amount || 0), 0), 0);
  const splitMethodCount = Object.values(splitAmounts).filter((amount) => Number(amount || 0) > 0).length;
  const splitDifference = total - splitPaidTotal;
  const splitPaymentValid = cart.length > 0 && splitMethodCount >= 2 && Math.abs(splitDifference) < 0.01;
  const customerNameValid = !customerName.trim() || customerName.trim().length >= 2;
  const customerMobileValid = !customerMobile || /^\d{10}$/.test(customerMobile);

  useEffect(() => {
    if (!recentlyAddedKey || !billItemsRef.current) return undefined;
    const addedLine = Array.from(billItemsRef.current.children).find((element) => element.dataset.cartItemKey === recentlyAddedKey);
    addedLine?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = window.setTimeout(() => setRecentlyAddedKey(""), 900);
    return () => window.clearTimeout(timer);
  }, [cart, recentlyAddedKey]);

  useEffect(() => {
    if (selectedReceptionOrderId && !pendingTableOrders.some((order) => String(order.id) === String(selectedReceptionOrderId))) {
      setSelectedReceptionOrderId("");
      setExpandedReceptionOrderId("");
    }
  }, [pendingTableOrders, selectedReceptionOrderId]);

  function getCartItemKey(item) {
    return `${String(item.id ?? "item")}::${String(item.name ?? "").trim().toLowerCase()}`;
  }

  function add(item) {
    const cartItemKey = getCartItemKey(item);
    setRecentlyAddedKey(cartItemKey);
    setCart((current) => {
      const existing = current.find((entry) => getCartItemKey(entry) === cartItemKey);
      if (existing) return current.map((entry) => (getCartItemKey(entry) === cartItemKey ? { ...entry, qty: entry.qty + 1 } : entry));
      return [...current, { ...item, cartItemKey, qty: 1, notes: "" }];
    });
    notify(`${item.name} added`);
  }

  function addBarcodeMatch() {
    const scannedCode = query.trim().toLowerCase();
    if (!scannedCode) return;
    const matchedItem = catalogItems.find((item) => String(item.barcode || "").trim().toLowerCase() === scannedCode);
    if (!matchedItem) return;
    add(matchedItem);
    setQuery("");
  }

  function changeQty(cartItemKey, delta) {
    setCart((current) => current.map((item) => getCartItemKey(item) === cartItemKey ? { ...item, qty: Math.max(item.qty + delta, 1) } : item));
  }

  function removeItem(cartItemKey) {
    const removed = cart.find((item) => getCartItemKey(item) === cartItemKey);
    if (removed) onVoidItem(removed, orderType);
    setCart((current) => current.filter((item) => getCartItemKey(item) !== cartItemKey));
    notify(removed ? `${removed.name} voided` : "Item removed");
  }

  function completeCheckout(selectedPayment, splitPayments = []) {
    if (customerName && !customerNameValid) {
      notify("Enter at least 2 characters for customer name or leave it blank");
      return false;
    }
    if (!customerMobileValid) {
      notify("Enter a valid 10-digit customer mobile number");
      return false;
    }
    const bill = { id: `BILL-${Date.now()}`, orderNumber, cashier: currentUser?.name || "POS User", customerName: customerName.trim(), customerMobile, orderType, tableOrderId: sourceTableOrder?.id || "", tableName: sourceTableOrder?.tableName || "", waiter: sourceTableOrder?.waiterName || "", guestCount: Number(sourceTableOrder?.guestCount || 0), items: cart, subtotal, cgst, sgst, tax, discount, total, payment: selectedPayment, splitPayments, itemCount: cart.reduce((sum, item) => sum + item.qty, 0), syncStatus: online ? "Synced" : "Pending sync", completedAt: new Date().toISOString() };
    if (!online) {
      const queued = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]");
      localStorage.setItem("vestora-offline-orders", JSON.stringify([...queued, bill]));
      notify("Offline bill saved for sync");
    } else {
      notify(`Paid ${formatMoney(total)} by ${selectedPayment}`);
    }
    onSale(bill);
    if (sourceTableOrder) onTableOrderPaid?.(sourceTableOrder, bill);
    setCompletedBill(bill);
    setShowSplitPayment(false);
    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setDiscount(0);
    setSourceTableOrder(null);
    setOrderNumber(`ORD-${Date.now().toString().slice(-6)}`);
    setOrderCreatedAt(new Date());
  }

  function checkout() {
    if (paymentMode === "Split") {
      openSplitPayment();
      return;
    }
    completeCheckout(paymentMode);
  }

  function openSplitPayment() {
    if (!cart.length) {
      notify("Add items before splitting payment");
      return;
    }
    const cashShare = Math.floor(total / 2);
    setPaymentMode("Split");
    setSplitAmounts({ Cash: String(cashShare), UPI: String(total - cashShare), Card: "", Wallet: "", Credit: "" });
    setShowSplitPayment(true);
  }

  function completeSplitPayment(event) {
    event.preventDefault();
    if (!splitPaymentValid) {
      notify("Split amounts must match the bill total using at least two methods");
      return;
    }
    const payments = Object.entries(splitAmounts).filter(([, amount]) => Number(amount || 0) > 0).map(([method, amount]) => ({ method, amount: Number(amount) }));
    completeCheckout("Split", payments);
  }

  function printCompletedBill() {
    if (!completedBill) return;
    notify("Opening print preview");
    window.setTimeout(() => window.print(), 80);
  }

  function reprintHistoryBill() {
    if (!selectedHistoryBill) return;
    const cleanup = () => document.body.classList.remove("printing-history-bill");
    document.body.classList.add("printing-history-bill");
    window.addEventListener("afterprint", cleanup, { once: true });
    notify(`Reprinting ${selectedHistoryBill.orderNumber || selectedHistoryBill.id}`);
    window.setTimeout(() => window.print(), 80);
  }

  function confirmCloseShift(event) {
    event.preventDefault();
    const balance = Math.round(Number(closingBalance));
    if (Number.isNaN(balance) || balance < 0) {
      notify("Enter valid closing amount");
      return;
    }
    if (needsVarianceNote && !varianceNoteValid) {
      notify("Variance note needs at least 15 characters");
      return;
    }
    onCloseShift(balance, {
      expectedClosingCash,
      cashSales: shiftCashSales,
      cashRefunds: shiftCashRefunds,
      variance: closingVariance,
      varianceNote: varianceNote.trim(),
    });
  }

  function openOrderHistory() {
    setHistoryScope("Today");
    setHistorySearch("");
    setSelectedHistoryId("");
    setShowOrderHistory(true);
  }

  function loadReceptionOrder(order) {
    const loadedItems = (Array.isArray(order.items) ? order.items : []).map((savedItem) => {
      const itemRecord = typeof savedItem === "string" ? { name: savedItem } : savedItem || {};
      const catalogMatch = catalogItems.find((item) => (
        (itemRecord.id != null && String(item.id) === String(itemRecord.id))
        || (itemRecord.name && String(item.name).trim().toLowerCase() === String(itemRecord.name).trim().toLowerCase())
      ));
      const item = { ...catalogMatch, ...itemRecord };
      const name = String(item.name || "").trim();
      if (!name) return null;
      const qty = Math.max(1, Number(item.qty || 1));
      const price = Number(item.price ?? catalogMatch?.price ?? 0);
      const normalized = { ...item, name, qty, price: Number.isFinite(price) ? price : 0 };
      return { ...normalized, cartItemKey: getCartItemKey(normalized) };
    }).filter(Boolean);

    if (!loadedItems.length) {
      notify(`${order.tableName || "Selected table"} has no saved bill items`);
      return;
    }

    setCart(loadedItems);
    setRecentlyAddedKey(loadedItems[0].cartItemKey);
    setOrderType("Dine-in");
    setSourceTableOrder(order);
    setCustomerName(String(order.customerName || ""));
    setCustomerMobile(String(order.customerMobile || "").replace(/\D/g, "").slice(-10));
    setOrderNumber(order.orderNumber || `ORD-${Date.now().toString().slice(-6)}`);
    setOrderCreatedAt(new Date(order.receptionSentAt || order.createdAt || Date.now()));
    setShowReceptionQueue(false);
    setSelectedReceptionOrderId("");
    setExpandedReceptionOrderId("");
    window.requestAnimationFrame(() => {
      billPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      billItemsRef.current?.focus({ preventScroll: true });
    });
    const loadedCount = loadedItems.reduce((sum, item) => sum + item.qty, 0);
    notify(`${order.tableName} loaded with ${loadedCount} ${loadedCount === 1 ? "item" : "items"}`);
  }

  function openReceptionQueue() {
    setSelectedReceptionOrderId("");
    setExpandedReceptionOrderId("");
    setShowReceptionQueue(true);
  }

  const billPaperClass = `bill-paper print-bill bill-layout-${String(billTemplate.layout || "Detailed").toLowerCase()}`;
  const previewBillPaperClass = completedBill ? billPaperClass.replace(" print-bill", "") : billPaperClass;
  const billPaperStyle = getBillPaperStyle(billTemplate);

  return (
    <section className="pos-screen">
      <div className="pos-page-header">
        <div className="pos-brand-lockup">
          <img src={vestoraLogoPath} alt="" />
          <div>
            <p>VESTORA POS</p>
            <h1>POS Billing</h1>
          </div>
        </div>
        <div className="pos-page-actions">
          <span className={online ? "pill online" : "pill offline"}>{online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? "Online" : "Offline"}</span>
          <span className="shift-pill"><small>Opening float</small><strong>{formatMoney(currentShift.openingBalance)}</strong></span>
          <span className="shift-pill"><small>Cash sales</small><strong>{formatMoney(shiftCashSales)}</strong></span>
          <button className={pendingTableOrders.length ? "reception-queue-button has-orders" : "reception-queue-button"} onClick={openReceptionQueue}><ReceiptText size={16} /> Reception {pendingTableOrders.length ? `(${pendingTableOrders.length})` : ""}</button>
          <button className="pos-close-shift" onClick={() => setShowCloseShift(true)}>Close shift</button>
          <button className="pos-exit-button" onClick={onExit}><PanelLeftClose size={17} /> Exit POS</button>
          <button className="pos-exit-button" onClick={onLogout}><LogOut size={17} /> Logout</button>
        </div>
      </div>
      <div className="pos-catalog">
        <div className="toolbar">
          <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addBarcodeMatch(); } }} placeholder="Search item or scan barcode" /></label>
          <div className="segmented">{["Dine-in", "Takeaway", "Delivery", "Online"].map((type) => <button key={type} className={orderType === type ? "selected" : ""} onClick={() => { setOrderType(type); notify(`${type} billing selected`); }}>{type}</button>)}</div>
        </div>
        <div className="catalog-section-head"><div><span>Menu catalog</span><strong>{filtered.length} available items</strong></div><div className="category-row">{categories.map((name) => <button key={name} className={category === name ? "chip active" : "chip"} onClick={() => setCategory(name)}>{name}</button>)}</div></div>
        <div className="item-grid">{filtered.map((item) => {
          const catalogItemKey = getCartItemKey(item);
          return <button key={catalogItemKey} className="item-card" onClick={() => add(item)}><img className="item-photo" src={getMenuItemPhoto(item)} alt="" loading="lazy" /><span>{item.category}</span><strong>{item.name}</strong>{item.barcode && <small className="item-barcode">Barcode {item.barcode}</small>}<em>{formatMoney(item.price)}</em></button>;
        })}</div>
      </div>
      <div ref={billPanelRef} className="bill-panel">
        <PanelHead title={sourceTableOrder ? `Bill preview · ${cartItemCount} ${cartItemCount === 1 ? "item" : "items"}` : "Bill preview"} icon={ReceiptText} />
          <div className={previewBillPaperClass} style={billPaperStyle}>
            <BillReceiptHeader billTemplate={billTemplate} />
          {billTemplate.showOrderInfo !== false && <div className="bill-type-row"><span>Billing type</span><strong>{orderType}</strong></div>}
          {sourceTableOrder && (
            <div className="bill-table-row">
              <span className="bill-table-detail">
                <small>Table</small>
                <strong>{sourceTableOrder.tableName}</strong>
              </span>
              <span className="bill-table-detail">
                <small>Seats</small>
                <strong>{sourceTableOrder.guestCount || 1}</strong>
              </span>
              <span className="bill-table-detail bill-table-waiter">
                <small>Waiter</small>
                <strong title={sourceTableOrder.waiterName}>{sourceTableOrder.waiterName}</strong>
              </span>
            </div>
          )}
          {billTemplate.showCustomer !== false && <div className="bill-customer-details">
            <label className={customerName && !customerNameValid ? "bill-customer-field invalid" : "bill-customer-field"}>
              <User size={14} />
              <span className="bill-customer-input">
                <small>Customer name</small>
                <input type="text" autoComplete="name" maxLength="60" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Optional" aria-label="Customer name" aria-invalid={Boolean(customerName && !customerNameValid)} />
              </span>
            </label>
            <label className={customerMobile && !customerMobileValid ? "bill-customer-field invalid" : "bill-customer-field"}>
              <Phone size={14} />
              <span className="bill-customer-input">
                <small>Mobile</small>
                <input type="tel" inputMode="numeric" autoComplete="tel" maxLength="10" value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Optional" aria-label="Customer mobile" aria-invalid={Boolean(customerMobile && !customerMobileValid)} />
              </span>
            </label>
          </div>}
          <BillReceiptMeta billTemplate={billTemplate} rows={[
            ["Order number", orderNumber],
            ["Date & time", orderCreatedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })],
            billTemplate.showPayment !== false && ["Payment", paymentMode],
          ]} />
          <div ref={billItemsRef} className="bill-items scrollable" tabIndex={0} aria-label="Selected bill items">
            {cart.length === 0 ? <p className="empty">No items added</p> : cart.map((item) => {
              const cartItemKey = getCartItemKey(item);
              return (
              <div className={recentlyAddedKey === cartItemKey ? "bill-line editable recently-added" : "bill-line editable"} key={cartItemKey} data-cart-item-key={cartItemKey}>
                <span>{item.qty} x {item.name}</span>
                <div className="qty-tools">
                  <button onClick={() => changeQty(cartItemKey, -1)} title="Decrease"><Minus size={14} /></button>
                  <button onClick={() => changeQty(cartItemKey, 1)} title="Increase"><Plus size={14} /></button>
                  <button onClick={() => removeItem(cartItemKey)} title="Remove"><Trash2 size={14} /></button>
                  <strong>{formatMoney(item.qty * item.price)}</strong>
                </div>
              </div>
              );
            })}
          </div>
          <div className="totals">
            <span>Subtotal <strong>{formatMoney(subtotal)}</strong></span>
            <span>Discount <strong>{formatMoney(discount)}</strong></span>
            {billTemplate.showTaxBreakup !== false && <span>CGST <strong>{formatMoney(cgst)}</strong></span>}
            {billTemplate.showTaxBreakup !== false && <span>SGST <strong>{formatMoney(sgst)}</strong></span>}
            {billTemplate.showItemCount && <span>Items <strong>{cartItemCount}</strong></span>}
            <b>Grand total <strong>{formatMoney(total)}</strong></b>
            <BillReceiptFooter billTemplate={billTemplate} />
          </div>
        </div>
        <div className="payment-grid">{["Cash", "UPI", "Card", "Split"].map((mode) => <button key={mode} className={paymentMode === mode ? "active-pay" : ""} onClick={() => mode === "Split" ? openSplitPayment() : (setPaymentMode(mode), notify(`${mode} selected`))}>{mode}</button>)}</div>
        <div className="bill-actions">
          <button className={paymentMode === "Credit" ? "active-pay" : ""} onClick={() => { setPaymentMode("Credit"); notify("Credit selected"); }}>Credit</button>
          <button className={paymentMode === "Wallet" ? "wallet-action active-pay" : "wallet-action"} onClick={() => { setPaymentMode("Wallet"); notify("Wallet selected"); }}>Wallet</button>
          <button className={discount > 0 ? "discount-action active-pay" : "discount-action"} onClick={() => {
            if (discount > 0) {
              setDiscount(0);
              notify("Discount removed");
              return;
            }
            if (!subtotal) {
              notify("Add items before applying discount");
              return;
            }
            setDiscount(Math.round(subtotal * 0.1));
            notify("10% discount applied");
          }}><Percent size={17} /> {discount > 0 ? "Remove discount" : "Discount"}</button>
          <button className={showOrderHistory ? "history-action active-secondary-action" : "history-action"} onClick={openOrderHistory}><History size={17} /> Order history</button>
          <button className="primary" disabled={!cart.length} onClick={checkout}>Complete sale {formatMoney(total)}</button>
        </div>
      </div>
      {showSplitPayment && (
        <div className="shift-modal-backdrop" role="presentation">
          <form className="shift-modal split-payment-modal" onSubmit={completeSplitPayment}>
            <div className="shift-modal-head">
              <div><p>Payment</p><h2>Split payment</h2></div>
              <button type="button" onClick={() => setShowSplitPayment(false)}>Close</button>
            </div>
            <div className="split-payment-total"><span>Bill total</span><strong>{formatMoney(total)}</strong></div>
            <div className="split-payment-grid">
              {Object.keys(splitAmounts).map((method) => (
                <label className={Number(splitAmounts[method] || 0) > 0 ? "split-payment-method selected" : "split-payment-method"} key={method}>
                  <span>{method}</span>
                  <span className="split-amount-input"><small>₹</small><input type="number" min="0" step="0.01" value={splitAmounts[method]} onChange={(event) => setSplitAmounts((current) => ({ ...current, [method]: event.target.value }))} placeholder="0" /></span>
                </label>
              ))}
            </div>
            <div className="split-payment-summary">
              <span>Allocated<strong>{formatMoney(splitPaidTotal)}</strong></span>
              <span className={Math.abs(splitDifference) < 0.01 ? "ok" : "warn"}>{splitDifference >= 0 ? "Remaining" : "Excess"}<strong>{formatMoney(Math.abs(splitDifference))}</strong></span>
              <span>Methods<strong>{splitMethodCount}</strong></span>
            </div>
            <div className="shift-actions">
              <button type="button" onClick={() => setShowSplitPayment(false)}>Cancel</button>
              <button className="primary-table-action" type="submit" disabled={!splitPaymentValid}>Complete payment</button>
            </div>
          </form>
        </div>
      )}
      {showReceptionQueue && (
        <div className="shift-modal-backdrop" role="presentation">
          <section className="shift-modal reception-queue-modal" role="dialog" aria-modal="true" aria-label="Reception billing queue">
            <div className="shift-modal-head">
              <div><p>Dining completed</p><h2>Reception billing queue</h2></div>
              <button type="button" onClick={() => setShowReceptionQueue(false)}>Close</button>
            </div>
            <div className="reception-order-list">
              {!pendingTableOrders.length && <div className="reception-empty"><ReceiptText size={28} /><strong>No tables waiting</strong><span>Waiter bill requests will appear here.</span></div>}
              {pendingTableOrders.map((order) => {
                const orderTotal = (order.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
                const isSelected = String(selectedReceptionOrderId) === String(order.id);
                const isExpanded = String(expandedReceptionOrderId) === String(order.id);
                return <div className={isSelected ? "reception-order-row selected" : "reception-order-row"} key={order.id}>
                  <label className="reception-order-check">
                    <input type="checkbox" checked={isSelected} onChange={() => setSelectedReceptionOrderId(isSelected ? "" : order.id)} aria-label={`Select ${order.tableName} bill`} />
                    <span />
                  </label>
                  <div className="reception-order-summary"><strong>{order.tableName}</strong><span>{order.waiterName} / {order.guestCount || 1} {Number(order.guestCount || 1) === 1 ? "seat" : "seats"} / {(order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)} items</span></div>
                  <strong className="reception-order-total">{formatMoney(orderTotal)}</strong>
                  <button className="reception-review-button" type="button" onClick={() => setExpandedReceptionOrderId(isExpanded ? "" : order.id)} aria-expanded={isExpanded}><Eye size={16} /> {isExpanded ? "Hide" : "Check bill"}</button>
                  {isExpanded && <div className="reception-order-items">
                    {(order.items || []).map((item) => <div key={`${order.id}-${item.id || item.name}`}><span>{Number(item.qty || 1)} x {item.name}</span><strong>{formatMoney(Number(item.price || 0) * Number(item.qty || 1))}</strong></div>)}
                  </div>}
                </div>;
              })}
            </div>
            {!!pendingTableOrders.length && <div className="reception-queue-actions">
              <span>{selectedReceptionOrder ? `${selectedReceptionOrder.tableName} selected` : "Select one bill to continue"}</span>
              <button type="button" onClick={() => setShowReceptionQueue(false)}>Cancel</button>
              <button className="primary-table-action" type="button" disabled={!selectedReceptionOrder} onClick={() => selectedReceptionOrder && loadReceptionOrder(selectedReceptionOrder)}>Load selected bill</button>
            </div>}
          </section>
        </div>
      )}
      {completedBill && (
        <div className="shift-modal-backdrop" role="presentation">
          <section className="shift-modal completed-bill-modal" role="dialog" aria-modal="true" aria-label="Payment complete">
            <div className="shift-modal-head">
              <div><p>Payment successful</p><h2>Bill completed</h2></div>
              <button type="button" onClick={() => setCompletedBill(null)}>Close</button>
            </div>
            <div className="payment-complete-banner"><ShieldCheck size={26} /><div><strong>{formatMoney(completedBill.total)} received</strong><span>{completedBill.payment === "Split" ? `${completedBill.splitPayments.length} payment methods` : completedBill.payment}</span></div></div>
            <div className="completed-bill-summary">
              <span><small>Order number</small><strong>{completedBill.orderNumber}</strong></span>
              <span><small>Billing type</small><strong>{completedBill.orderType}</strong></span>
              <span><small>Payment</small><strong>{completedBill.payment}</strong></span>
              {completedBill.customerName && <span><small>Customer name</small><strong>{completedBill.customerName}</strong></span>}
              {completedBill.customerMobile && <span><small>Customer mobile</small><strong>{completedBill.customerMobile}</strong></span>}
              <span><small>Items</small><strong>{completedBill.itemCount}</strong></span>
              <span><small>Status</small><strong>Paid</strong></span>
            </div>
            <div className={`${billPaperClass} completed-receipt completed-print-receipt`} style={billPaperStyle} aria-hidden="true">
              <BillReceiptHeader billTemplate={billTemplate} />
              <div className="bill-type-row"><span>Billing type</span><strong>{completedBill.orderType}{completedBill.tableName ? ` · ${completedBill.tableName}` : ""}</strong></div>
              <div className="bill-order-details"><span><small>Order number</small><strong>{completedBill.orderNumber}</strong></span><span><small>Payment</small><strong>{completedBill.payment}</strong></span>{completedBill.customerName && <span><small>Customer name</small><strong>{completedBill.customerName}</strong></span>}{completedBill.customerMobile && <span><small>Customer mobile</small><strong>{completedBill.customerMobile}</strong></span>}</div>
              {completedBill.payment === "Split" && <div className="completed-split-lines">{completedBill.splitPayments.map((entry) => <span key={entry.method}>{entry.method}<strong>{formatMoney(entry.amount)}</strong></span>)}</div>}
              <div className="bill-items">{completedBill.items.map((item) => <div className="bill-line" key={getCartItemKey(item)}><span>{item.qty} x {item.name}</span><strong>{formatMoney(item.qty * item.price)}</strong></div>)}</div>
              <div className="totals"><span>Subtotal <strong>{formatMoney(completedBill.subtotal)}</strong></span><span>Discount <strong>{formatMoney(completedBill.discount)}</strong></span>{billTemplate.showTaxBreakup !== false && <span>CGST <strong>{formatMoney(Number(completedBill.cgst ?? Math.round(Number(completedBill.tax || 0) / 2)))}</strong></span>}{billTemplate.showTaxBreakup !== false && <span>SGST <strong>{formatMoney(Number(completedBill.sgst ?? Number(completedBill.tax || 0) - Math.round(Number(completedBill.tax || 0) / 2)))}</strong></span>}{billTemplate.showItemCount && <span>Items <strong>{completedBill.itemCount}</strong></span>}<b>Grand total <strong>{formatMoney(completedBill.total)}</strong></b><BillReceiptFooter billTemplate={billTemplate} /></div>
            </div>
            <div className="shift-actions completed-bill-actions"><button type="button" onClick={() => setCompletedBill(null)}>Done</button><button className="primary-table-action" type="button" onClick={printCompletedBill}><Printer size={17} /> Print bill</button></div>
          </section>
        </div>
      )}
      {showOrderHistory && (
        <div className="shift-modal-backdrop" role="presentation">
          <section className="order-history-modal" role="dialog" aria-modal="true" aria-label="Order history">
            <div className="shift-modal-head order-history-head">
              <div>
                <p>{selectedHistoryBill ? "Completed bill" : "Completed POS bills"}</p>
                <h2>{selectedHistoryBill ? "Order details" : "Order history"}</h2>
              </div>
              <button type="button" onClick={() => setShowOrderHistory(false)}>Close</button>
            </div>
            {!selectedHistoryBill ? (
              <>
                <div className="order-history-toolbar">
                  <label className="search"><Search size={16} /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search orders" /></label>
                  <div className="segmented compact-history-filter">
                    {["Today", "All orders"].map((scope) => <button key={scope} className={historyScope === scope ? "selected" : ""} onClick={() => { setHistoryScope(scope); setSelectedHistoryId(""); }}>{scope}</button>)}
                  </div>
                  <strong>{visibleHistoryOrders.length}</strong>
                </div>
                <div className="order-history-list compact-order-list">
                  {visibleHistoryOrders.length === 0 && <div className="order-history-empty"><ReceiptText size={28} /><strong>No completed orders</strong><span>Paid POS bills will appear here.</span></div>}
                  {visibleHistoryOrders.map((bill) => (
                    <div key={bill.id} className="compact-order-row">
                      <span><strong>{bill.orderNumber || bill.id}</strong><small>{formatDateTime(bill.createdAt)}</small></span>
                      <span><em>{bill.orderType}</em><strong>{formatMoney(Number(bill.total || 0))}</strong></span>
                      <button type="button" title="View order details" aria-label={`View ${bill.orderNumber || bill.id}`} onClick={() => setSelectedHistoryId(bill.id)}><Eye size={17} /></button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="compact-order-detail">
                <div className="order-history-detail-actions">
                  <button className="order-history-back" type="button" onClick={() => setSelectedHistoryId("")}><PanelLeftClose size={16} /> Back to orders</button>
                  <button className="history-reprint-action" type="button" onClick={reprintHistoryBill}><Printer size={16} /> Reprint bill</button>
                </div>
                <div className="order-history-detail-head">
                  <div><small>Order number</small><h3>{selectedHistoryBill.orderNumber || selectedHistoryBill.id}</h3><span>{formatDateTime(selectedHistoryBill.createdAt)}</span></div>
                  <strong>{formatMoney(Number(selectedHistoryBill.total || 0))}</strong>
                </div>
                <div className="order-history-meta">
                  <span><small>Billing type</small><strong>{selectedHistoryBill.orderType}</strong></span>
                  <span><small>Payment</small><strong>{selectedHistoryBill.payment}</strong></span>
                  {selectedHistoryBill.customerName && <span><small>Customer name</small><strong>{selectedHistoryBill.customerName}</strong></span>}
                  {selectedHistoryBill.customerMobile && <span><small>Customer mobile</small><strong>{selectedHistoryBill.customerMobile}</strong></span>}
                </div>
                <div className="order-history-items">
                  <div className="order-history-items-head"><span>Products ({selectedHistoryBill.itemCount || (selectedHistoryBill.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)})</span><span>Amount</span></div>
                  {(selectedHistoryBill.items || []).map((item) => <div key={getCartItemKey(item)}><span><strong>{item.qty} x {item.name}</strong><small>{formatMoney(Number(item.price || 0))} each</small></span><strong>{formatMoney(Number(item.price || 0) * Number(item.qty || 0))}</strong></div>)}
                </div>
                <div className="order-history-totals">
                  <span>Subtotal<strong>{formatMoney(Number(selectedHistoryBill.subtotal || 0))}</strong></span>
                  <span>Discount<strong>{formatMoney(Number(selectedHistoryBill.discount || 0))}</strong></span>
                  <span>CGST<strong>{formatMoney(selectedHistoryCgst)}</strong></span>
                  <span>SGST<strong>{formatMoney(selectedHistorySgst)}</strong></span>
                  <b>Grand total<strong>{formatMoney(Number(selectedHistoryBill.total || 0))}</strong></b>
                </div>
                <div className={`${billPaperClass} completed-receipt completed-print-receipt history-print-receipt`} style={billPaperStyle} aria-hidden="true">
                  <BillReceiptHeader billTemplate={billTemplate} />
                  <div className="bill-type-row"><span>Billing type</span><strong>{selectedHistoryBill.orderType}{selectedHistoryBill.tableName ? ` · ${selectedHistoryBill.tableName}` : ""}</strong></div>
                  <div className="bill-order-details">
                    <span><small>Order number</small><strong>{selectedHistoryBill.orderNumber || selectedHistoryBill.id}</strong></span>
                    <span><small>Date & time</small><strong>{formatDateTime(selectedHistoryBill.createdAt || selectedHistoryBill.completedAt)}</strong></span>
                    <span><small>Payment</small><strong>{selectedHistoryBill.payment}</strong></span>
                    {selectedHistoryBill.customerName && <span><small>Customer name</small><strong>{selectedHistoryBill.customerName}</strong></span>}
                    {selectedHistoryBill.customerMobile && <span><small>Customer mobile</small><strong>{selectedHistoryBill.customerMobile}</strong></span>}
                    {selectedHistoryBill.waiter && <span><small>Waiter</small><strong>{selectedHistoryBill.waiter}</strong></span>}
                    {selectedHistoryBill.guestCount > 0 && <span><small>Guests</small><strong>{selectedHistoryBill.guestCount}</strong></span>}
                  </div>
                  {selectedHistoryBill.payment === "Split" && <div className="completed-split-lines">{(selectedHistoryBill.splitPayments || []).map((entry) => <span key={entry.method}>{entry.method}<strong>{formatMoney(Number(entry.amount || 0))}</strong></span>)}</div>}
                  <div className="bill-items">{(selectedHistoryBill.items || []).map((item) => <div className="bill-line" key={getCartItemKey(item)}><span>{item.qty} x {item.name}</span><strong>{formatMoney(Number(item.qty || 0) * Number(item.price || 0))}</strong></div>)}</div>
                  <div className="totals"><span>Subtotal <strong>{formatMoney(Number(selectedHistoryBill.subtotal || 0))}</strong></span><span>Discount <strong>{formatMoney(Number(selectedHistoryBill.discount || 0))}</strong></span>{billTemplate.showTaxBreakup !== false && <span>CGST <strong>{formatMoney(selectedHistoryCgst)}</strong></span>}{billTemplate.showTaxBreakup !== false && <span>SGST <strong>{formatMoney(selectedHistorySgst)}</strong></span>}{billTemplate.showItemCount && <span>Items <strong>{selectedHistoryBill.itemCount || (selectedHistoryBill.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)}</strong></span>}<b>Grand total <strong>{formatMoney(Number(selectedHistoryBill.total || 0))}</strong></b><BillReceiptFooter billTemplate={billTemplate} /></div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {showCloseShift && (
        <div className="shift-modal-backdrop" role="presentation">
          <form className="shift-modal" onSubmit={confirmCloseShift}>
            <div className="shift-modal-head">
              <div>
                <p>POS shift</p>
                <h2>Close shift</h2>
              </div>
              <button type="button" onClick={() => setShowCloseShift(false)}>Close</button>
            </div>
            <div className="shift-summary">
              <span>Opening balance<strong>{formatMoney(currentShift.openingBalance)}</strong></span>
              <span>Cash sales<strong>{formatMoney(shiftCashSales)}</strong></span>
              <span>Expected closing<strong>{formatMoney(expectedClosingCash)}</strong></span>
              <span>Entered closing<strong>{Number.isNaN(Number(closingBalance)) ? "Invalid" : formatMoney(Number(closingBalance || 0))}</strong></span>
              <span className={closingVariance === 0 ? "shift-variance ok" : "shift-variance warn"}>{closingVariance === 0 ? "Tallied" : closingVariance > 0 ? "Excess cash" : "Short cash"}<strong>{Number.isNaN(enteredClosingBalance) ? "Invalid" : formatMoney(Math.abs(closingVariance || 0))}</strong></span>
            </div>
            <label>Close shift amount<input type="number" min="0" step="1" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} autoFocus /></label>
            {needsVarianceNote && <label>Variance note<textarea value={varianceNote} minLength="15" onChange={(event) => setVarianceNote(event.target.value)} placeholder="Enter reason for short/excess cash before closing shift" /><small>Minimum 15 characters required. {varianceNote.trim().length}/15</small></label>}
            <div className="shift-actions">
              <button type="button" onClick={() => setShowCloseShift(false)}>Cancel</button>
              <button className="primary-table-action" type="submit" disabled={needsVarianceNote && !varianceNoteValid}>Close shift</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function KDS({ notify, orders, setOrders, kotPrinter }) {
  const columns = ["New", "Preparing", "Ready", "Completed"];

  function advance(id) {
    setOrders((current) => current.map((order) => {
      if (order.id !== id) return order;
      const next = columns[Math.min(columns.indexOf(order.status) + 1, columns.length - 1)];
      notify(`${order.id} moved to ${next}`);
      return { ...order, status: next };
    }));
  }

  return (
    <section className="screen">
      <div className="kot-printer-strip">
        <span className={kotPrinter.enabled && kotPrinter.status === "Connected" ? "pill online" : "pill offline"}>{kotPrinter.enabled && kotPrinter.status === "Connected" ? "KOT printer connected" : "KOT printer disconnected"}</span>
        <strong>{kotPrinter.name}</strong>
        <em>{kotPrinter.paper} / {kotPrinter.ip}:{kotPrinter.port}</em>
      </div>
      <div className="kanban">
        {columns.map((column) => (
          <div className="kds-column" key={column}>
            <h3>{column}</h3>
            {orders.filter((order) => order.status === column).length === 0 && <p className="empty-kds">No ordered items</p>}
            {orders.filter((order) => order.status === column).map((order) => (
              <div className="ticket" key={order.id}>
                <div className="ticket-head"><strong>{order.id}</strong><span>{order.table}<small>{order.age}</small></span></div>
                <div className="ticket-lines">{order.items.map((line) => <p key={line}>{line}</p>)}</div>
                <div className="ticket-actions">
                  <button disabled={column === "Completed"} onClick={() => advance(order.id)}>{column === "Ready" ? "Complete" : column === "Completed" ? "Done" : "Advance"}</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Tables({ notify, canManageAll, storeId, items, currentUser, tableOrders = [], onSaveOrder, onSendKot, onSendReception, onCancelOrder, onCancelItem, kotPrinter }) {
  const [floors, setFloors] = useState(() => {
    const saved = loadStoredArray(`vestora-floors-${storeId}`);
    return saved.length ? saved : floorOptions;
  });
  const [floor, setFloor] = useState(() => floors[0] || "Main");
  const [tables, setTables] = useState(() => {
    const saved = loadStoredArray(`vestora-tables-${storeId}`);
    return saved.length ? saved : initialTables;
  });
  const [selected, setSelected] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showFloorSetup, setShowFloorSetup] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [showWaiterOrder, setShowWaiterOrder] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: "", floor: "Main", seats: 4, status: "Available" });
  const [orderItems, setOrderItems] = useState([]);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderCategory, setOrderCategory] = useState("All");
  const [workingOrder, setWorkingOrder] = useState(null);
  const [printSlip, setPrintSlip] = useState(null);
  const [cancelRequest, setCancelRequest] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const visibleTables = tables.filter((table) => table.floor === floor);
  const selectedTable = tables.find((table) => table.id === selected);
  const catalogItems = (items?.length ? items : menuItems).filter((item) => item.status !== "Inactive");
  const orderCategories = ["All", ...Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean)))];
  const filteredOrderItems = catalogItems.filter((item) => (orderCategory === "All" || item.category === orderCategory) && [item.name, item.category, item.barcode].join(" ").toLowerCase().includes(orderQuery.trim().toLowerCase()));
  const activeTableOrder = selectedTable ? tableOrders.find((order) => order.tableId === selectedTable.id && order.status !== "Paid" && order.status !== "Cancelled") : null;
  const addonTableOrder = activeTableOrder
    && ["Taking order", "KOT sent"].includes(activeTableOrder.status)
    && Array.isArray(activeTableOrder.items)
    && activeTableOrder.items.length > 0
    ? activeTableOrder
    : null;
  const canStartTableOrder = selectedTable?.status === "Available" && !activeTableOrder;
  const canTakeTableOrder = Boolean(canStartTableOrder || addonTableOrder);
  const orderSubtotal = orderItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const orderItemCount = orderItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  useEffect(() => {
    localStorage.setItem(`vestora-tables-${storeId}`, JSON.stringify(tables));
  }, [tables, storeId]);

  useEffect(() => {
    localStorage.setItem(`vestora-floors-${storeId}`, JSON.stringify(floors));
  }, [floors, storeId]);

  function createFloor(event) {
    event.preventDefault();
    if (!canManageAll) {
      notify("Admin permission required to create floors");
      return;
    }
    const name = newFloorName.trim().replace(/\s+/g, " ");
    if (!name) {
      notify("Enter a floor name");
      return;
    }
    if (floors.some((item) => item.toLowerCase() === name.toLowerCase())) {
      notify(`${name} floor already exists`);
      return;
    }
    setFloors((current) => [...current, name]);
    setFloor(name);
    setSelected(null);
    setGuestCount(1);
    setEditingId(null);
    setShowSetup(false);
    setShowFloorSetup(false);
    setNewFloorName("");
    setDraft((current) => ({ ...current, floor: name }));
    notify(`${name} floor created`);
  }

  function deleteCurrentFloor() {
    if (!canManageAll) {
      notify("Admin permission required to delete floors");
      return;
    }
    if (floors.length <= 1) {
      notify("At least one floor is required");
      return;
    }
    const tablesOnFloor = tables.filter((table) => table.floor === floor);
    if (tablesOnFloor.length) {
      notify(`Move or delete ${tablesOnFloor.length} table${tablesOnFloor.length === 1 ? "" : "s"} from ${floor} first`);
      return;
    }
    if (!window.confirm(`Delete the ${floor} floor?`)) return;
    const nextFloors = floors.filter((name) => name !== floor);
    const nextFloor = nextFloors[0];
    setFloors(nextFloors);
    setFloor(nextFloor);
    setSelected(null);
    setGuestCount(1);
    setEditingId(null);
    setShowSetup(false);
    setShowFloorSetup(false);
    setDraft((current) => ({ ...current, floor: nextFloor }));
    notify(`${floor} floor deleted`);
  }

  function updateSelected(status) {
    if (!selected) {
      notify("Select a table first");
      return;
    }
    setTables((current) => current.map((table) => table.id === selected ? { ...table, status } : table));
    if (editingId === selected) {
      setDraft((current) => ({ ...current, status }));
    }
    notify(`Table updated to ${status}`);
  }

  function selectTable(table) {
    const existingOrder = tableOrders.find((order) => order.tableId === table.id && order.status !== "Paid" && order.status !== "Cancelled");
    setSelected(table.id);
    setGuestCount(Math.min(Number(table.seats || 1), Math.max(1, Number(existingOrder?.guestCount || 1))));
    setShowWaiterOrder(false);
    notify(`${table.name} selected`);
  }

  function changeGuestCount(delta) {
    if (!selectedTable) return;
    const capacity = Math.max(1, Number(selectedTable.seats || 1));
    setGuestCount((current) => Math.min(capacity, Math.max(1, Number(current || 1) + delta)));
  }

  function setTableStatus(tableId, status) {
    setTables((current) => current.map((table) => table.id === tableId ? { ...table, status } : table));
  }

  function startWaiterOrder() {
    if (!selectedTable) {
      notify("Select a table first");
      return;
    }
    if (!canStartTableOrder && !addonTableOrder) {
      notify(activeTableOrder ? "Add-ons are closed for this table order" : "Select an Available table to start an order");
      return;
    }
    const existing = addonTableOrder || {
      id: `TABLE-ORDER-${Date.now()}`,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      tableId: selectedTable.id,
      tableName: selectedTable.name,
      floor: selectedTable.floor,
      waiterId: currentUser?.id || "",
      waiterName: currentUser?.name || "Waiter",
      guestCount,
      status: "Taking order",
      createdAt: new Date().toISOString(),
      items: [],
    };
    setGuestCount(Math.min(Number(selectedTable.seats || 1), Math.max(1, Number(existing.guestCount || guestCount || 1))));
    setWorkingOrder(existing);
    setOrderItems((existing.items || []).map((item) => ({ ...item, qty: Number(item.qty || 1) })));
    setOrderQuery("");
    setOrderCategory("All");
    setShowWaiterOrder(true);
  }

  function addOrderItem(item) {
    setOrderItems((current) => {
      const existing = current.find((entry) => String(entry.id) === String(item.id));
      if (existing) return current.map((entry) => String(entry.id) === String(item.id) ? { ...entry, qty: Number(entry.qty || 0) + 1 } : entry);
      return [...current, { ...item, qty: 1, notes: "" }];
    });
    notify(`${item.name} added to ${selectedTable?.name}`);
  }

  function changeOrderQty(itemId, delta) {
    setOrderItems((current) => current.map((item) => String(item.id) === String(itemId) ? { ...item, qty: Math.max(1, Number(item.qty || 1) + delta) } : item));
  }

  function removeOrderItem(itemId) {
    const item = orderItems.find((entry) => String(entry.id) === String(itemId));
    const isSavedOrder = workingOrder && tableOrders.some((order) => order.id === workingOrder.id && ["Taking order", "KOT sent"].includes(order.status));
    if (!item) return;
    if (!isSavedOrder) {
      setOrderItems((current) => current.filter((entry) => String(entry.id) !== String(itemId)));
      return;
    }
    if (orderItems.length === 1) {
      notify("Use Cancel order to cancel the final item");
      return;
    }
    setCancelReason("");
    setCancelRequest({ type: "item", item });
  }

  function requestCancelOrder() {
    if (!addonTableOrder) return;
    setCancelReason("");
    setCancelRequest({ type: "order" });
  }

  function confirmCancellation(event) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      notify("Enter a cancellation reason of at least 5 characters");
      return;
    }
    if (cancelRequest.type === "item") {
      const nextItems = orderItems.filter((item) => String(item.id) !== String(cancelRequest.item.id));
      const updated = onCancelItem(buildTableOrder(), cancelRequest.item, reason, nextItems);
      setOrderItems(nextItems);
      setWorkingOrder(updated);
    } else {
      const cancelled = onCancelOrder(buildTableOrder("Cancelled"), reason);
      setWorkingOrder(cancelled);
      setTableStatus(selectedTable.id, "Available");
      setShowWaiterOrder(false);
      setSelected(null);
      setGuestCount(1);
    }
    setCancelRequest(null);
    setCancelReason("");
  }

  function buildTableOrder(status = workingOrder?.status || "Taking order") {
    return {
      ...workingOrder,
      tableId: selectedTable.id,
      tableName: selectedTable.name,
      floor: selectedTable.floor,
      waiterId: workingOrder?.waiterId || currentUser?.id || "",
      waiterName: workingOrder?.waiterName || currentUser?.name || "Waiter",
      guestCount,
      items: orderItems,
      itemCount: orderItemCount,
      subtotal: orderSubtotal,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  function saveOrderDraft() {
    if (!orderItems.length) {
      notify("Add at least one item");
      return null;
    }
    const order = buildTableOrder();
    const saved = onSaveOrder(order);
    setWorkingOrder(saved);
    setTableStatus(selectedTable.id, "Occupied");
    notify(`${selectedTable.name} order saved`);
    return saved;
  }

  function printTableSlip(type, order) {
    setPrintSlip({ type, order });
    window.setTimeout(() => window.print(), 100);
  }

  function printAndSendKot() {
    const order = saveOrderDraft();
    if (!order) return;
    const sent = onSendKot(order);
    if (sent.kotNoChanges) return;
    setWorkingOrder(sent);
    setTableStatus(selectedTable.id, "Occupied");
    printTableSlip("kot", sent);
  }

  function finishDining() {
    if (!orderItems.length) {
      notify("Add and save the table order first");
      return;
    }
    if (!workingOrder?.kotId) {
      notify("Print and send the KOT before completing dining");
      return;
    }
    const order = buildTableOrder(workingOrder?.kotId ? "KOT sent" : "Taking order");
    const saved = onSaveOrder(order);
    const receptionOrder = onSendReception(saved);
    setWorkingOrder(receptionOrder);
    setTableStatus(selectedTable.id, "Billing pending");
    printTableSlip("reception", receptionOrder);
    setShowWaiterOrder(false);
  }

  function startAddTable() {
    const nextNumber = tables.length + 1;
    setEditingId(null);
    setSelected(null);
    setGuestCount(1);
    setShowSetup(true);
    setDraft({ name: `T${nextNumber}`, floor, seats: 4, status: "Available" });
    notify("Add table details");
  }

  function editSelectedTable() {
    if (!selectedTable) {
      notify("Select a table first");
      return;
    }
    setEditingId(selectedTable.id);
    setShowSetup(true);
    setDraft({
      name: selectedTable.name,
      floor: selectedTable.floor,
      seats: selectedTable.seats,
      status: selectedTable.status,
    });
    notify(`Editing ${selectedTable.name}`);
  }

  function saveTable(event) {
    event.preventDefault();
    if (!canManageAll) {
      notify("Admin permission required to manage table setup");
      return;
    }
    const name = draft.name.trim();
    const seats = Number(draft.seats);
    if (!name || seats < 1) {
      notify("Enter table name and seats");
      return;
    }
    const tableData = { name, floor: draft.floor, seats, status: draft.status };
    if (editingId) {
      setTables((current) => current.map((table) => table.id === editingId ? { ...table, ...tableData } : table));
      setSelected(editingId);
      notify(`${name} updated`);
    } else {
      const nextId = Math.max(0, ...tables.map((table) => table.id)) + 1;
      const created = { id: nextId, ...tableData };
      setTables((current) => [...current, created]);
      setSelected(nextId);
      notify(`${name} added`);
    }
    setFloor(draft.floor);
    setEditingId(null);
    setShowSetup(false);
  }

  function deleteSelectedTable() {
    if (!canManageAll) {
      notify("Admin permission required to delete tables");
      return;
    }
    if (!selectedTable) {
      notify("Select a table first");
      return;
    }
    setTables((current) => current.filter((table) => table.id !== selectedTable.id));
    setSelected(null);
    setGuestCount(1);
    setEditingId(null);
    setShowSetup(false);
    notify(`${selectedTable.name} deleted`);
  }

  function moveTable(tableId, direction) {
    setTables((current) => {
      const floorTables = current.filter((table) => table.floor === floor);
      const currentIndex = floorTables.findIndex((table) => table.id === tableId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= floorTables.length) return current;

      const reorderedFloor = [...floorTables];
      [reorderedFloor[currentIndex], reorderedFloor[nextIndex]] = [reorderedFloor[nextIndex], reorderedFloor[currentIndex]];
      let floorIndex = 0;
      return current.map((table) => table.floor === floor ? reorderedFloor[floorIndex++] : table);
    });
  }

  return (
    <section className="screen">
      <div className="floorbar">
        <div className="floor-tabs-wrap">
          <div className="segmented floor-tabs">{floors.map((name) => <button key={name} className={floor === name ? "selected" : ""} onClick={() => { setFloor(name); setSelected(null); setGuestCount(1); setEditingId(null); setShowSetup(false); setShowFloorSetup(false); setDraft((current) => ({ ...current, floor: name })); }}>{name}</button>)}</div>
          {canManageAll && <button className="add-floor-button" type="button" onClick={() => { setShowFloorSetup(true); setNewFloorName(""); }}><Plus size={16} /> Add floor</button>}
          {canManageAll && <button className="delete-floor-button" type="button" onClick={deleteCurrentFloor} title={`Delete ${floor} floor`}><Trash2 size={16} /> Delete floor</button>}
        </div>
        <div className="floor-actions">
          <div className="floor-selection-actions">
            <span className="selected-table-chip">{selectedTable ? `${selectedTable.name} selected` : "Select a table"}</span>
            {selectedTable && (
              <div className="table-seat-picker" aria-label={`Seats selected for ${selectedTable.name}`}>
                <span>Seats</span>
                <button type="button" aria-label="Remove one seat" disabled={!canTakeTableOrder || guestCount <= 1} onClick={() => changeGuestCount(-1)}><Minus size={14} /></button>
                <strong>{guestCount}</strong>
                <small>of {selectedTable.seats}</small>
                <button type="button" aria-label="Add one seat" disabled={!canTakeTableOrder || guestCount >= Number(selectedTable.seats || 1)} onClick={() => changeGuestCount(1)}><Plus size={14} /></button>
              </div>
            )}
            <button
              className="waiter-order-button"
              disabled={!canTakeTableOrder}
              title={selectedTable && !canTakeTableOrder ? (activeTableOrder ? "Add-ons close after dining is completed" : "Select an Available table to start an order") : undefined}
              onClick={startWaiterOrder}
            >
              <ClipboardList size={16} /> {addonTableOrder ? "Add on" : "Take order"}
            </button>
          </div>
          <div className="floor-table-actions">
            {canManageAll && (
              <button
                className={`reorder-tables-button ${reorderMode ? "active" : ""}`}
                type="button"
                disabled={visibleTables.length < 2}
                onClick={() => {
                  setReorderMode((current) => !current);
                  setShowSetup(false);
                  setEditingId(null);
                  notify(reorderMode ? "Table order saved" : "Reorder mode opened");
                }}
              >
                <GripVertical size={17} /> {reorderMode ? "Done reordering" : "Reorder tables"}
              </button>
            )}
            {canManageAll && <button onClick={startAddTable}>Add table</button>}
            {canManageAll && <button disabled={!selectedTable} onClick={editSelectedTable}>Edit table</button>}
            <button disabled={!selectedTable} onClick={() => updateSelected("Reserved")}>Reserve selected</button>
            <button disabled={!selectedTable} onClick={() => updateSelected("Occupied")}>Mark occupied</button>
            <button disabled={!selectedTable} onClick={() => updateSelected("Available")}>Mark available</button>
          </div>
        </div>
      </div>
      {canManageAll && showFloorSetup && (
        <form className="floor-create-form" onSubmit={createFloor}>
          <div className="floor-create-copy"><strong>Create floor</strong><span>Add another dining area for this branch.</span></div>
          <label>Floor name<input autoFocus value={newFloorName} onChange={(event) => setNewFloorName(event.target.value)} placeholder="Rooftop" maxLength={40} /></label>
          <div className="floor-create-actions">
            <button type="button" onClick={() => { setShowFloorSetup(false); setNewFloorName(""); }}>Cancel</button>
            <button className="primary-table-action" type="submit"><Plus size={16} /> Create floor</button>
          </div>
        </form>
      )}
      {canManageAll && showSetup && (
        <form className="table-setup" onSubmit={saveTable}>
          <div className="table-setup-head">
            <div>
              <strong>Table setup</strong>
              <span>{editingId ? `Editing ${selectedTable?.name || "table"}` : "Create a new table"}</span>
            </div>
            <button type="button" onClick={() => { setShowSetup(false); setEditingId(null); }}>Close</button>
          </div>
          <div className="table-fields">
            <label>Table name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="T1" /></label>
            <label>Seats<input type="number" min="1" value={draft.seats} onChange={(event) => setDraft((current) => ({ ...current, seats: event.target.value }))} /></label>
            <label>Floor<select value={draft.floor} onChange={(event) => setDraft((current) => ({ ...current, floor: event.target.value }))}>{floors.map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{tableStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          </div>
          <div className="table-setup-actions">
            <button type="button" disabled={!selectedTable} onClick={editSelectedTable}>Load selected</button>
            <button className="primary-table-action" type="submit">{editingId ? "Save changes" : "Add table"}</button>
            <button className="danger-table-action" type="button" disabled={!selectedTable} onClick={deleteSelectedTable}>Delete selected</button>
          </div>
        </form>
      )}
      <div className="floor">
        {visibleTables.map((table, index) => (
          <div className={`table-layout-card ${reorderMode ? "reordering" : ""}`} key={table.id}>
            {reorderMode && <span className="table-position-badge" aria-label={`Position ${index + 1}`}>{index + 1}</span>}
            <button className={`table ${table.status.toLowerCase().replaceAll(" ", "-")} ${selected === table.id ? "selected-table" : ""}`} onClick={() => selectTable(table)}>
              <strong>{table.name}</strong>
              <span>{table.status}</span>
              <small>{table.seats} seats</small>
              {tableOrders.some((order) => order.tableId === table.id && order.status !== "Paid" && order.status !== "Cancelled") && <em>Order active</em>}
            </button>
            {reorderMode && (
              <div className="table-reorder-controls" aria-label={`Reorder ${table.name}`}>
                <button type="button" disabled={index === 0} onClick={() => moveTable(table.id, -1)} title={`Move ${table.name} left`} aria-label={`Move ${table.name} left`}><ArrowLeft size={17} /></button>
                <span><GripVertical size={15} /> Position {index + 1}</span>
                <button type="button" disabled={index === visibleTables.length - 1} onClick={() => moveTable(table.id, 1)} title={`Move ${table.name} right`} aria-label={`Move ${table.name} right`}><ChevronRight size={18} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showWaiterOrder && selectedTable && (
        <div className="shift-modal-backdrop waiter-order-backdrop" role="presentation">
          <section className="waiter-order-modal" role="dialog" aria-modal="true" aria-label={`Order for ${selectedTable.name}`}>
            <div className="waiter-order-head">
              <div><p>Waiter ordering · {selectedTable.floor} floor</p><h2>{selectedTable.name} order</h2><span>{guestCount} seats · {workingOrder?.waiterName || currentUser?.name || "Waiter"}</span></div>
              <button type="button" onClick={() => setShowWaiterOrder(false)}>Close</button>
            </div>
            <div className="waiter-order-body">
              <div className="waiter-menu-panel">
                <label className="search"><Search size={17} /><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Search menu items" /></label>
                <div className="waiter-category-row">{orderCategories.map((name) => <button type="button" key={name} className={orderCategory === name ? "selected" : ""} onClick={() => setOrderCategory(name)}>{name}</button>)}</div>
                <div className="waiter-menu-grid">{filteredOrderItems.map((item) => <button type="button" key={item.id} onClick={() => addOrderItem(item)}><img src={getMenuItemPhoto(item)} alt="" /><span><small>{item.category}</small><strong>{item.name}</strong><em>{formatMoney(item.price)}</em></span><Plus size={17} /></button>)}</div>
              </div>
              <div className="waiter-cart-panel">
                <div className="waiter-cart-head"><div><span>Table order</span><strong>{orderItemCount} items</strong></div><span className={`table-order-status ${String(workingOrder?.status || "taking-order").toLowerCase().replaceAll(" ", "-")}`}>{workingOrder?.status || "Taking order"}</span></div>
                <div className="waiter-cart-lines">
                  {!orderItems.length && <div className="waiter-cart-empty"><ClipboardList size={28} /><strong>No items selected</strong><span>Choose items from the menu.</span></div>}
                  {orderItems.map((item) => <div className="waiter-cart-line" key={item.id}><div><strong>{item.name}</strong><small>{formatMoney(item.price)} each</small></div><div className="waiter-qty"><button type="button" onClick={() => changeOrderQty(item.id, -1)}><Minus size={14} /></button><strong>{item.qty}</strong><button type="button" onClick={() => changeOrderQty(item.id, 1)}><Plus size={14} /></button><button className="remove" type="button" onClick={() => removeOrderItem(item.id)}><Trash2 size={14} /></button></div><strong>{formatMoney(Number(item.price || 0) * Number(item.qty || 0))}</strong></div>)}
                </div>
                <div className="waiter-order-total"><span>Estimated subtotal</span><strong>{formatMoney(orderSubtotal)}</strong></div>
                <div className="waiter-order-actions">
                  {addonTableOrder && <button className="cancel-order-action" type="button" onClick={requestCancelOrder}><Trash2 size={16} /> Cancel order</button>}
                  <button type="button" onClick={saveOrderDraft} disabled={!orderItems.length}>{addonTableOrder ? "Save add-on" : "Save order"}</button>
                  <button className="kot-action" type="button" onClick={printAndSendKot} disabled={!orderItems.length}><Printer size={17} /> {addonTableOrder ? "Print add-on KOT" : "Print KOT"}</button>
                  <button className="reception-action" type="button" onClick={finishDining} disabled={!orderItems.length}><ReceiptText size={17} /> Dining complete · Send reception</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      {cancelRequest && (
        <div className="shift-modal-backdrop order-cancel-backdrop" role="presentation">
          <form className="shift-modal order-cancel-modal" onSubmit={confirmCancellation}>
            <div className="shift-modal-head">
              <div><small>Table {selectedTable?.name}</small><h2>{cancelRequest.type === "order" ? "Cancel order" : "Cancel item"}</h2></div>
              <button type="button" onClick={() => setCancelRequest(null)}>Close</button>
            </div>
            <div className="order-cancel-summary">
              <span>{cancelRequest.type === "order" ? workingOrder?.orderNumber : cancelRequest.item.name}</span>
              <strong>{cancelRequest.type === "order" ? formatMoney(orderSubtotal) : `${cancelRequest.item.qty} x ${formatMoney(cancelRequest.item.price)}`}</strong>
            </div>
            <label className="order-cancel-reason">Cancellation reason
              <textarea autoFocus value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Enter the reason for this cancellation" minLength={5} maxLength={180} />
            </label>
            <div className="shift-modal-actions">
              <button type="button" onClick={() => setCancelRequest(null)}>Keep order</button>
              <button className="danger-confirm-action" type="submit">{cancelRequest.type === "order" ? "Cancel full order" : "Cancel item"}</button>
            </div>
          </form>
        </div>
      )}
      {printSlip && (
        <div className="waiter-print-slip">
          <div className="kot-ticket-head"><strong>{printSlip.type === "kot" ? "KITCHEN ORDER TICKET" : "RECEPTION BILL REQUEST"}</strong><span>{printSlip.order.kotId || printSlip.order.orderNumber}</span></div>
          <div className="kot-meta"><span>Table <strong>{printSlip.order.tableName}</strong></span><span>Seats <strong>{printSlip.order.guestCount || 1}</strong></span><span>Waiter <strong>{printSlip.order.waiterName}</strong></span><span>Time <strong>{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</strong></span></div>
          <div className="kot-lines">{(printSlip.type === "kot" ? (printSlip.order.kotPrintItems || printSlip.order.items) : printSlip.order.items).map((item) => <p key={item.id}>{item.qty} x {item.name}</p>)}</div>
          {printSlip.type === "reception" && <div className="reception-slip-total"><span>Subtotal</span><strong>{formatMoney(printSlip.order.subtotal)}</strong><small>PAYMENT PENDING · OPEN IN POS RECEPTION QUEUE</small></div>}
          <small>VESTORA · {printSlip.type === "kot" ? (kotPrinter?.name || "KOT printer") : "RECEPTION"}</small>
        </div>
      )}
    </section>
  );
}

function Inventory({ notify, canManageAll, storeId }) {
  const storageKey = `vestora-inventory-${storeId}`;
  const categoryStorageKey = `vestora-inventory-categories-${storeId}`;
  const defaultCategories = ["Dry goods", "Dairy", "Vegetables", "Beverages", "Operations", "Packaging", "Other"];
  const blankDraft = { name: "", sku: "", category: "Dry goods", stock: "", unit: "kg", reorder: "", cost: "" };
  const savedItems = stripUntouchedDefaultRecords(loadStoredArray(storageKey), defaultInventoryItems, ["updatedAt"]);
  const savedCategories = loadStoredArray(categoryStorageKey);
  const [items, setItems] = useState(() => savedItems);
  const [categories, setCategories] = useState(() => Array.from(new Set([...defaultCategories, ...savedCategories, ...(savedItems.length ? savedItems : defaultInventoryItems).map((item) => item.category).filter(Boolean)])));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [skuIsManual, setSkuIsManual] = useState(false);
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  useEffect(() => {
    localStorage.setItem(categoryStorageKey, JSON.stringify(categories));
  }, [categories, categoryStorageKey]);

  const getStatus = (item) => {
    const stock = Number(item.stock || 0);
    const reorder = Number(item.reorder || 0);
    if (stock <= reorder) return "Low stock";
    if (reorder > 0 && stock <= reorder * 1.25) return "Watch";
    return "Healthy";
  };
  const lowCount = items.filter((item) => getStatus(item) === "Low stock").length;
  const watchCount = items.filter((item) => getStatus(item) === "Watch").length;
  const healthyCount = items.filter((item) => getStatus(item) === "Healthy").length;
  const inventoryValue = items.reduce((total, item) => total + Number(item.stock || 0) * Number(item.cost || 0), 0);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    const matchesSearch = !normalizedQuery || [item.name, item.sku, item.category].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    const matchesFilter = filter === "All" || getStatus(item) === filter;
    return matchesSearch && matchesFilter;
  });

  const formatQuantity = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const generateSku = (name, excludedId = "") => {
    const itemCode = String(name || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map((word) => word.slice(0, 4)).join("-") || "ITEM";
    const prefix = `INV-${itemCode}`;
    const existingSkus = new Set(items.filter((item) => item.id !== excludedId).map((item) => String(item.sku || "").toUpperCase()));
    let serial = 1;
    let sku = `${prefix}-${String(serial).padStart(3, "0")}`;
    while (existingSkus.has(sku)) {
      serial += 1;
      sku = `${prefix}-${String(serial).padStart(3, "0")}`;
    }
    return sku;
  };
  const openCreate = () => {
    setEditingId(null);
    setDraft(blankDraft);
    setSkuIsManual(false);
    setCategoryCreatorOpen(false);
    setCategoryDraft("");
    setEditorOpen(true);
  };
  const openEdit = (item) => {
    setEditingId(item.id);
    setDraft({ ...item, stock: String(item.stock), reorder: String(item.reorder), cost: String(item.cost) });
    setSkuIsManual(true);
    setCategoryCreatorOpen(false);
    setCategoryDraft("");
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setDraft(blankDraft);
    setSkuIsManual(false);
    setCategoryCreatorOpen(false);
    setCategoryDraft("");
  };
  const updateDraft = (field, value) => {
    if (field === "sku") setSkuIsManual(Boolean(value.trim()));
    setDraft((current) => {
      if (field === "name" && !editingId && !skuIsManual) return { ...current, name: value, sku: value.trim() ? generateSku(value) : "" };
      return { ...current, [field]: value };
    });
  };
  const createCategory = () => {
    const nextCategory = categoryDraft.trim().replace(/\s+/g, " ");
    if (!nextCategory) {
      notify("Enter a category name");
      return;
    }
    const existingCategory = categories.find((categoryName) => categoryName.toLowerCase() === nextCategory.toLowerCase());
    if (existingCategory) {
      updateDraft("category", existingCategory);
      notify(`${existingCategory} is already available`);
    } else {
      setCategories((current) => [...current, nextCategory]);
      updateDraft("category", nextCategory);
      notify(`${nextCategory} category created`);
    }
    setCategoryDraft("");
    setCategoryCreatorOpen(false);
  };
  const saveItem = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      notify("Enter the item name");
      return;
    }
    if ([draft.stock, draft.reorder, draft.cost].some((value) => value === "" || Number(value) < 0)) {
      notify("Stock, reorder level, and unit cost must be valid values");
      return;
    }
    const resolvedSku = (draft.sku.trim() || generateSku(draft.name, editingId)).toUpperCase();
    const duplicateSku = items.some((item) => item.id !== editingId && String(item.sku || "").toUpperCase() === resolvedSku);
    if (duplicateSku) {
      notify("This SKU code is already in use");
      return;
    }
    const nextItem = {
      ...draft,
      id: editingId || `INV-${Date.now()}`,
      name: draft.name.trim(),
      sku: resolvedSku,
      stock: Number(draft.stock),
      reorder: Number(draft.reorder),
      cost: Number(draft.cost),
      updatedAt: new Date().toISOString(),
    };
    setItems((current) => editingId ? current.map((item) => item.id === editingId ? nextItem : item) : [nextItem, ...current]);
    notify(editingId ? `${nextItem.name} updated` : `${nextItem.name} added to inventory`);
    closeEditor();
  };
  const deleteItem = (item) => {
    if (!window.confirm(`Delete ${item.name} from inventory?`)) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (editingId === item.id) closeEditor();
    notify(`${item.name} deleted`);
  };
  const exportCsv = () => {
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Item", "SKU", "Category", "Stock", "Unit", "Reorder level", "Unit cost", "Status"],
      ...items.map((item) => [item.name, item.sku, item.category, item.stock, item.unit, item.reorder, item.cost, getStatus(item)]),
    ];
    const blob = new Blob([rows.map((row) => row.map(escapeCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vestora-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Inventory exported as CSV");
  };

  return (
    <section className="screen inventory-screen">
      <div className="inventory-page-head">
        <div className="inventory-title-block">
          <span className="inventory-title-icon"><Boxes size={24} /></span>
          <div><span>Stock control</span><h2>Inventory management</h2><p>Monitor stock levels, reorder points, and inventory value for this branch.</p></div>
        </div>
        <div className="inventory-head-actions">
          <button type="button" onClick={exportCsv}><Download size={17} /> Export CSV</button>
          {canManageAll && <button className="primary" type="button" onClick={openCreate}><Plus size={18} /> Add inventory item</button>}
        </div>
      </div>

      <div className="inventory-metrics">
        <article><span className="inventory-metric-icon"><PackageSearch size={21} /></span><div><small>Total items</small><strong>{items.length}</strong><em>Tracked materials</em></div></article>
        <article className="danger"><span className="inventory-metric-icon"><AlertTriangle size={21} /></span><div><small>Low stock</small><strong>{lowCount}</strong><em>Requires attention</em></div></article>
        <article className="watch"><span className="inventory-metric-icon"><Gauge size={21} /></span><div><small>Watch list</small><strong>{watchCount}</strong><em>Near reorder level</em></div></article>
        <article><span className="inventory-metric-icon"><BadgeIndianRupee size={21} /></span><div><small>Stock value</small><strong>{formatMoney(inventoryValue)}</strong><em>{healthyCount} healthy items</em></div></article>
      </div>

      <div className="panel inventory-workspace">
        {editorOpen && (
          <form className="inventory-editor" onSubmit={saveItem}>
            <div className="inventory-editor-head">
              <div><span>{editingId ? "Update stock record" : "New stock record"}</span><h3>{editingId ? `Edit ${draft.name}` : "Add inventory item"}</h3></div>
              <button type="button" className="icon-button" onClick={closeEditor} title="Close editor" aria-label="Close editor"><X size={18} /></button>
            </div>
            <div className="inventory-form-grid">
              <label><span>Item name</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="e.g. Basmati Rice" autoFocus /></label>
              <label><span>SKU / item code</span><input value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} placeholder="Generated from item name" /></label>
              <div className="inventory-category-field"><div className="inventory-category-head"><span>Category</span><button className="inventory-add-category" type="button" onClick={() => setCategoryCreatorOpen((open) => !open)} aria-expanded={categoryCreatorOpen}><Plus size={14} /> New category</button></div><select value={draft.category} onChange={(event) => updateDraft("category", event.target.value)}>{categories.map((categoryName) => <option key={categoryName}>{categoryName}</option>)}</select>{categoryCreatorOpen && <div className="inventory-inline-category"><input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createCategory(); } }} placeholder="New category name" autoFocus /><button type="button" onClick={createCategory}><Save size={15} /> Add</button><button type="button" className="cancel" onClick={() => { setCategoryCreatorOpen(false); setCategoryDraft(""); }} title="Cancel category" aria-label="Cancel category"><X size={15} /></button></div>}</div>
              <label><span>Unit</span><select value={draft.unit} onChange={(event) => updateDraft("unit", event.target.value)}><option>kg</option><option>g</option><option>ltr</option><option>ml</option><option>pcs</option><option>cyl</option><option>box</option><option>pack</option></select></label>
              <label><span>Current stock</span><input type="number" min="0" step="0.01" value={draft.stock} onChange={(event) => updateDraft("stock", event.target.value)} placeholder="0" /></label>
              <label><span>Reorder level</span><input type="number" min="0" step="0.01" value={draft.reorder} onChange={(event) => updateDraft("reorder", event.target.value)} placeholder="0" /></label>
              <label><span>Unit cost</span><div className="inventory-money-input"><span>₹</span><input type="number" min="0" step="0.01" value={draft.cost} onChange={(event) => updateDraft("cost", event.target.value)} placeholder="0.00" /></div></label>
            </div>
            <div className="inventory-editor-actions"><button type="button" onClick={closeEditor}>Cancel</button><button className="primary" type="submit"><Save size={17} /> {editingId ? "Save changes" : "Save item"}</button></div>
          </form>
        )}

        <div className="inventory-toolbar">
          <div className="inventory-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU, or category" /></div>
          <div className="inventory-filter" aria-label="Inventory status filter">
            {["All", "Low stock", "Watch", "Healthy"].map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}
          </div>
          <span className="inventory-result-count">{visibleItems.length} of {items.length} items</span>
        </div>

        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Reorder at</th><th>Unit cost</th><th>Status</th>{canManageAll && <th><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {visibleItems.map((item) => {
                const status = getStatus(item);
                const stockRatio = Math.min(100, Number(item.reorder || 0) ? (Number(item.stock || 0) / Number(item.reorder)) * 70 : 100);
                return <tr key={item.id}>
                  <td><div className="inventory-item-cell"><span>{String(item.name || "I").slice(0, 1).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.sku}</small></div></div></td>
                  <td><span className="inventory-category">{item.category}</span></td>
                  <td><div className="inventory-stock-cell"><strong>{formatQuantity(item.stock)} {item.unit}</strong><span><i style={{ width: `${stockRatio}%` }} className={status === "Low stock" ? "low" : status === "Watch" ? "watch" : ""} /></span></div></td>
                  <td>{formatQuantity(item.reorder)} {item.unit}</td>
                  <td>{formatMoney(item.cost)}</td>
                  <td><span className={`inventory-status ${status.toLowerCase().replace(" ", "-")}`}>{status === "Healthy" && <CircleCheck size={14} />}{status !== "Healthy" && <AlertTriangle size={14} />}{status}</span></td>
                  {canManageAll && <td><div className="inventory-row-actions"><button type="button" onClick={() => openEdit(item)} title={`Edit ${item.name}`} aria-label={`Edit ${item.name}`}><Pencil size={16} /></button><button className="delete" type="button" onClick={() => deleteItem(item)} title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`}><Trash2 size={16} /></button></div></td>}
                </tr>;
              })}
              {!visibleItems.length && <tr><td className="inventory-empty" colSpan={canManageAll ? 7 : 6}><PackageSearch size={30} /><strong>No inventory items found</strong><span>Try another search or status filter.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Production({ notify, storeId, canManageAll, activeView = "Recipes", activeReport = "Daily Production", onViewChange }) {
  const today = localDateKey();
  const recipeKey = `vestora-recipes-${storeId}`;
  const inventoryKey = `vestora-inventory-${storeId}`;
  const categoryKey = `vestora-production-categories-${storeId}`;
  const batchKey = `vestora-production-batches-${storeId}`;
  const wastageKey = `vestora-production-wastage-${storeId}`;
  const transactionKey = `vestora-inventory-transactions-${storeId}`;
  const finishedGoodsKey = `vestora-finished-goods-${storeId}`;
  const savedRecipes = stripUntouchedDefaultRecords(loadStoredArray(recipeKey), defaultRecipes, ["changedAt", "changedBy"]);
  const savedRecipeCategories = loadStoredArray(categoryKey);
  const productionTabs = ["Recipes", "Planning", "Batches", "Wastage", "Reports"];
  const [activeTab, setActiveTab] = useState(productionTabs.includes(activeView) ? activeView : "Recipes");
  const [recipes, setRecipes] = useState(() => savedRecipes);
  const [recipeCategories, setRecipeCategories] = useState(() => Array.from(new Set([...productionCategories, ...savedRecipeCategories, ...(savedRecipes.length ? savedRecipes : defaultRecipes).map((recipe) => recipe.category).filter(Boolean)])));
  const [inventory, setInventory] = useState(() => stripUntouchedDefaultRecords(loadStoredArray(inventoryKey), defaultInventoryItems, ["updatedAt"]));
  const [batches, setBatches] = useState(() => {
    return stripUntouchedDefaultRecords(loadStoredArray(batchKey), defaultProductionBatches, ["materialsIssued", "endTime"]);
  });
  const [wastageEntries, setWastageEntries] = useState(() => loadStoredArray(wastageKey));
  const [transactions, setTransactions] = useState(() => loadStoredArray(transactionKey));
  const [finishedGoods, setFinishedGoods] = useState(() => loadStoredArray(finishedGoodsKey));
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id || "");
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0];
  const blankRecipe = {
    name: "",
    category: "Main Course",
    portion: "Full",
    outputQty: 1,
    outputUnit: "plate",
    sellingPrice: 0,
    version: 1,
    ingredients: [{ name: "", qty: 1, unit: "g" }],
  };
  const [recipeDraft, setRecipeDraft] = useState(() => selectedRecipe ? normalizeRecipeIngredientUnits(selectedRecipe) : blankRecipe);
  const [plan, setPlan] = useState({
    recipeId: selectedRecipe?.id || "",
    qty: Math.max(1, Number(selectedRecipe?.outputQty || 1)),
    batchName: "Lunch Batch",
    batchNo: `BATCH-${Date.now().toString().slice(-5)}`,
    date: today,
    startTime: "10:00",
    endTime: "",
    chef: "Kitchen Lead",
    kitchen: "Main Kitchen",
  });
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || "");
  const [wastageDraft, setWastageDraft] = useState({
    item: "",
    reason: "Kitchen Waste",
    qty: 1,
    unit: "kg",
    cost: 0,
    person: "",
    approval: "Pending",
    date: today,
  });
  const wastageStockItem = inventory.find((item) => item.name === wastageDraft.item);
  const wastageUnits = wastageStockItem ? productionUnits.filter((unit) => unitsAreCompatible(unit, wastageStockItem.unit)) : productionUnits;
  const wastageCost = wastageStockItem && unitsAreCompatible(wastageDraft.unit, wastageStockItem.unit)
    ? toBaseQuantity(wastageDraft.qty, wastageDraft.unit) * ingredientCostPerBase(wastageStockItem)
    : 0;
  const plannedRecipe = recipes.find((recipe) => recipe.id === plan.recipeId) || recipes[0];
  const planRows = calculateRequirements(plannedRecipe, plan.qty, inventory);
  const planCost = planRows.reduce((sum, row) => sum + row.cost, 0);
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const completedToday = batches.filter((batch) => batch.status === "Completed" && batch.date === today);
  const inProgress = batches.filter((batch) => batch.status === "In Progress").length;
  const finishedValue = finishedGoods.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const wastageValue = wastageEntries.filter((item) => item.approval === "Approved").reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const shortageRows = planRows.filter((row) => row.status === "Short");
  const recipeCost = calculateRecipeCost(recipeDraft, inventory);
  const recipeMargin = Number(recipeDraft.sellingPrice || 0) ? Math.round(((Number(recipeDraft.sellingPrice || 0) - recipeCost) / Number(recipeDraft.sellingPrice || 0)) * 100) : 0;
  const inventoryIngredientNames = new Set(inventory.map((item) => String(item.name || "").trim().toLowerCase()));
  const batchRecipeNames = new Map(batches.map((batch) => [batch.batchNo, batch.recipeName]));
  const ingredientConsumption = Array.from(transactions.filter((entry) => entry.type === "Issue" && inventoryIngredientNames.has(String(entry.item || "").trim().toLowerCase())).reduce((summary, entry) => {
    const parsedQty = parseProductionQty(entry.qty);
    const unit = entry.unit || parsedQty.unit || "piece";
    const quantityBase = Number.isFinite(Number(entry.qtyBase)) ? Number(entry.qtyBase) : toBaseQuantity(parsedQty.quantity, unit);
    const foodItem = entry.recipeName || batchRecipeNames.get(entry.batchNo) || "Unassigned recipe";
    const key = [entry.date, entry.item, foodItem, unitFamily(unit)].join("|");
    const current = summary.get(key) || { date: entry.date, item: entry.item, foodItem, unit, quantityBase: 0, batches: new Set(), cost: 0 };
    current.quantityBase += quantityBase;
    current.batches.add(entry.batchNo);
    current.cost += Number(entry.cost || 0);
    summary.set(key, current);
    return summary;
  }, new Map()).values()).sort((first, second) => String(second.date).localeCompare(String(first.date)) || String(first.item).localeCompare(String(second.item)) || String(first.foodItem).localeCompare(String(second.foodItem)));
  const ingredientConsumptionRows = ingredientConsumption.map((entry) => [entry.date, entry.item, entry.foodItem, formatProductionQty(entry.quantityBase, entry.unit), entry.batches.size, formatMoney(entry.cost)]);
  const dailyConsumptionRows = Array.from(ingredientConsumption.reduce((summary, entry) => {
    const key = [entry.date, entry.item, unitFamily(entry.unit)].join("|");
    const current = summary.get(key) || { date: entry.date, item: entry.item, unit: entry.unit, quantityBase: 0, foodItems: new Set(), batches: new Set(), cost: 0 };
    current.quantityBase += entry.quantityBase;
    current.foodItems.add(entry.foodItem);
    entry.batches.forEach((batchNo) => current.batches.add(batchNo));
    current.cost += entry.cost;
    summary.set(key, current);
    return summary;
  }, new Map()).values()).sort((first, second) => String(second.date).localeCompare(String(first.date)) || String(first.item).localeCompare(String(second.item))).map((entry) => [entry.date, entry.item, Array.from(entry.foodItems).join(", "), formatProductionQty(entry.quantityBase, entry.unit), entry.batches.size, formatMoney(entry.cost)]);
  const reports = {
    "Daily Production": batches.map((batch) => [batch.date, batch.batchNo, batch.recipeName, batch.qty, batch.status, formatMoney(batch.cost || 0)]),
    "Ingredient Consumption": ingredientConsumptionRows,
    "Food Cost Report": recipes.map((recipe) => {
      const costDetails = getRecipeCostDetails(recipe, inventory);
      if (costDetails.missingIngredients.length) {
        return [recipe.name, recipe.portion, `Missing cost: ${costDetails.missingIngredients.join(", ")}`, "-", "-", "-"];
      }
      const cost = costDetails.cost;
      const sellingPrice = Number(recipe.sellingPrice || 0);
      const grossProfit = sellingPrice - cost;
      const margin = sellingPrice ? (grossProfit / sellingPrice) * 100 : 0;
      return [
        recipe.name,
        recipe.portion,
        formatPreciseMoney(cost),
        formatPreciseMoney(sellingPrice),
        formatPreciseMoney(grossProfit),
        `${margin.toFixed(1)}%`,
      ];
    }),
    "Wastage Report": wastageEntries.map((entry) => [entry.date, entry.item, entry.reason, `${entry.qty} ${entry.unit}`, formatMoney(entry.cost || 0), entry.approval]),
    "Finished Goods Stock": finishedGoods.map((entry) => [entry.item, entry.qty, entry.unit, entry.batchNo, formatMoney(entry.cost || 0)]),
  };
  const reportColumns = {
    "Daily Production": ["Date", "Batch no.", "Recipe", "Quantity", "Status", "Cost"],
    "Ingredient Consumption": ["Date", "Ingredient", "Food item", "Consumed", "Batches", "Cost"],
    "Food Cost Report": ["Recipe", "Portion", "Recipe cost", "Selling price", "Gross profit", "Margin"],
    "Wastage Report": ["Date", "Item", "Reason", "Quantity", "Cost", "Approval"],
    "Finished Goods Stock": ["Item", "Quantity", "Unit", "Batch no.", "Cost"],
  };
  const selectedProductionReport = reports[activeReport] ? activeReport : productionReportNames[0];

  useEffect(() => localStorage.setItem(recipeKey, JSON.stringify(recipes)), [recipes, recipeKey]);
  useEffect(() => localStorage.setItem(categoryKey, JSON.stringify(recipeCategories)), [recipeCategories, categoryKey]);
  useEffect(() => localStorage.setItem(inventoryKey, JSON.stringify(inventory)), [inventory, inventoryKey]);
  useEffect(() => localStorage.setItem(batchKey, JSON.stringify(batches)), [batches, batchKey]);
  useEffect(() => localStorage.setItem(wastageKey, JSON.stringify(wastageEntries)), [wastageEntries, wastageKey]);
  useEffect(() => localStorage.setItem(transactionKey, JSON.stringify(transactions)), [transactions, transactionKey]);
  useEffect(() => localStorage.setItem(finishedGoodsKey, JSON.stringify(finishedGoods)), [finishedGoods, finishedGoodsKey]);

  useEffect(() => {
    if (productionTabs.includes(activeView) && activeView !== activeTab) setActiveTab(activeView);
  }, [activeView, activeTab]);

  useEffect(() => {
    setRecipeDraft((current) => normalizeRecipeIngredientUnits(current));
  }, [inventory]);

  function switchProductionTab(tab) {
    setActiveTab(tab);
    onViewChange?.(tab);
  }

  function openRecipe(recipe) {
    setSelectedRecipeId(recipe.id);
    setRecipeDraft(normalizeRecipeIngredientUnits(recipe));
    notify(`${recipe.name} recipe opened`);
  }

  function updateRecipe(field, value) {
    setRecipeDraft((current) => ({ ...current, [field]: value }));
  }

  function createRecipeCategory() {
    if (!canManageAll) {
      notify("Production Manager permission required");
      return;
    }
    const nextCategory = categoryDraft.trim().replace(/\s+/g, " ");
    if (!nextCategory) {
      notify("Enter a category name");
      return;
    }
    const existingCategory = recipeCategories.find((category) => category.toLowerCase() === nextCategory.toLowerCase());
    if (existingCategory) {
      updateRecipe("category", existingCategory);
      notify(`${existingCategory} category selected`);
    } else {
      setRecipeCategories((current) => [...current, nextCategory]);
      updateRecipe("category", nextCategory);
      notify(`${nextCategory} category created`);
    }
    setCategoryDraft("");
    setCategoryCreatorOpen(false);
  }

  function updateIngredient(index, field, value) {
    setRecipeDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function selectRecipeIngredient(index, name) {
    const stockItem = inventory.find((item) => item.name === name);
    const preferredUnit = stockItem
      ? unitFamily(stockItem.unit) === "weight" ? "g" : unitFamily(stockItem.unit) === "volume" ? "ml" : normalizeProductionUnit(stockItem.unit)
      : "g";
    setRecipeDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, name, unit: preferredUnit } : item),
    }));
  }

  function normalizeRecipeIngredientUnits(recipe) {
    if (!recipe?.ingredients?.length) return recipe;
    let changed = false;
    const ingredients = recipe.ingredients.map((ingredient) => {
      const stockItem = inventory.find((item) => item.name === ingredient.name);
      if (!stockItem || unitsAreCompatible(ingredient.unit, stockItem.unit)) return ingredient;
      changed = true;
      const preferredUnit = unitFamily(stockItem.unit) === "weight" ? "g" : unitFamily(stockItem.unit) === "volume" ? "ml" : normalizeProductionUnit(stockItem.unit);
      return { ...ingredient, unit: preferredUnit };
    });
    return changed ? { ...recipe, ingredients } : recipe;
  }

  function saveRecipe() {
    if (!canManageAll) {
      notify("Production Manager permission required to save recipes");
      return;
    }
    if (!recipeDraft.name.trim()) {
      notify("Enter recipe name");
      return;
    }
    const outputQty = Number(recipeDraft.outputQty);
    if (!Number.isFinite(outputQty) || outputQty <= 0) {
      notify("Recipe output must be greater than zero");
      return;
    }
    const sellingPrice = Number(recipeDraft.sellingPrice);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      notify("Selling price must be a valid non-negative amount");
      return;
    }
    const ingredients = recipeDraft.ingredients.filter((item) => item.name.trim()).map((item) => ({ ...item, qty: Number(item.qty || 0) }));
    if (!ingredients.length) {
      notify("Add at least one inventory ingredient to the recipe");
      return;
    }
    const invalidIngredient = ingredients.find((item) => {
      const stockItem = inventory.find((inventoryItem) => inventoryItem.name === item.name);
      return !Number.isFinite(item.qty) || item.qty <= 0 || !stockItem || !unitsAreCompatible(item.unit, stockItem.unit);
    });
    if (invalidIngredient) {
      notify(`${invalidIngredient.name || "Ingredient"} needs a positive quantity and a matching inventory unit`);
      return;
    }
    const existing = recipes.find((recipe) => recipe.id === recipeDraft.id);
    const savedRecipe = {
      ...recipeDraft,
      id: recipeDraft.id || `REC-${Date.now()}`,
      outputQty,
      sellingPrice,
      version: existing ? Number(existing.version || 1) + 1 : 1,
      changedBy: "Current user",
      changedAt: today,
      ingredients,
    };
    setRecipes((current) => current.some((recipe) => recipe.id === savedRecipe.id) ? current.map((recipe) => recipe.id === savedRecipe.id ? savedRecipe : recipe) : [savedRecipe, ...current]);
    setSelectedRecipeId(savedRecipe.id);
    setRecipeDraft(savedRecipe);
    notify(`${savedRecipe.name} recipe saved as version ${savedRecipe.version}`);
  }

  function deleteRecipe() {
    if (!canManageAll) {
      notify("Admin permission required to delete recipes");
      return;
    }
    if (!recipeDraft.id) return;
    setRecipes((current) => current.filter((recipe) => recipe.id !== recipeDraft.id));
    setRecipeDraft(blankRecipe);
    setSelectedRecipeId("");
    notify("Recipe deleted");
  }

  function startProduction() {
    if (!canManageAll) {
      notify("Production Manager permission required");
      return;
    }
    if (!plannedRecipe) {
      notify("Select a recipe first");
      return;
    }
    if (!Number.isFinite(Number(plan.qty)) || Number(plan.qty) <= 0) {
      notify("Production quantity must be greater than zero");
      return;
    }
    if (!planRows.length) {
      notify("The selected recipe has no valid ingredients");
      return;
    }
    if (shortageRows.length) {
      notify(`Shortage found: ${shortageRows[0].name}`);
      return;
    }
    const nextInventory = inventory.map((stockItem) => {
      const required = planRows.find((row) => row.name === stockItem.name);
      if (!required) return stockItem;
      const remainingBase = toBaseQuantity(stockItem.stock, stockItem.unit) - required.requiredBase;
      return { ...stockItem, stock: Number(fromBaseQuantity(remainingBase, stockItem.unit).toFixed(3)) };
    });
    const newBatch = {
      ...plan,
      id: `BATCH-${Date.now()}`,
      recipeName: plannedRecipe.name,
      status: "In Progress",
      outputQty: 0,
      outputUnit: plannedRecipe.outputUnit,
      cost: planCost,
      requirements: planRows,
      materialsIssued: true,
    };
    setInventory(nextInventory);
    setBatches((current) => [newBatch, ...current]);
    setSelectedBatchId(newBatch.id);
    switchProductionTab("Batches");
    setTransactions((current) => [
      ...planRows.map((row, index) => ({ id: `TRN-ISSUE-${Date.now()}-${index}`, type: "Issue", batchNo: newBatch.batchNo, recipeName: newBatch.recipeName, item: row.name, qty: formatProductionQty(row.requiredBase, row.unit), qtyBase: row.requiredBase, unit: row.unit, cost: row.cost, date: today })),
      ...current,
    ]);
    notify(`${newBatch.batchNo} started. Raw materials deducted from stock`);
  }

  function finishProduction(batch) {
    if (!canManageAll || !batch) {
      notify(batch ? "Production Manager permission required" : "Select a batch first");
      return;
    }
    if (batch.status === "Completed") {
      notify(`${batch.batchNo} is already completed`);
      return;
    }
    if (batch.status === "Cancelled") {
      notify(`${batch.batchNo} was cancelled and cannot be completed`);
      return;
    }
    const recipe = recipes.find((item) => item.id === batch.recipeId);
    const requirements = batch.requirements?.length ? batch.requirements : calculateRequirements(recipe, batch.qty, inventory);
    const shouldIssueMaterials = !batch.materialsIssued;
    if (shouldIssueMaterials && requirements.some((row) => row.status === "Short")) {
      notify("Cannot finish: inventory will become negative");
      return;
    }
    const nextInventory = shouldIssueMaterials ? inventory.map((stockItem) => {
      const required = requirements.find((row) => row.name === stockItem.name);
      if (!required) return stockItem;
      const remainingBase = toBaseQuantity(stockItem.stock, stockItem.unit) - required.requiredBase;
      return { ...stockItem, stock: Number(fromBaseQuantity(remainingBase, stockItem.unit).toFixed(3)) };
    }) : inventory;
    const finishedBatch = { ...batch, status: "Completed", endTime: batch.endTime || new Date().toTimeString().slice(0, 5), outputQty: Number(batch.qty || 0), cost: requirements.reduce((sum, row) => sum + row.cost, 0), materialsIssued: true };
    setInventory(nextInventory);
    setBatches((current) => current.map((item) => item.id === batch.id ? finishedBatch : item));
    setFinishedGoods((current) => [{ id: `FG-${Date.now()}`, item: batch.recipeName, qty: batch.qty, unit: recipe?.outputUnit || "plate", batchNo: batch.batchNo, cost: finishedBatch.cost, date: today }, ...current]);
    setTransactions((current) => [
      { id: `TRN-FG-${Date.now()}`, type: "Receipt", batchNo: batch.batchNo, item: batch.recipeName, qty: `${batch.qty} ${recipe?.outputUnit || "plate"}`, cost: finishedBatch.cost, date: today },
      ...(shouldIssueMaterials ? requirements.map((row, index) => ({ id: `TRN-${Date.now()}-${index}`, type: "Issue", batchNo: batch.batchNo, recipeName: batch.recipeName, item: row.name, qty: formatProductionQty(row.requiredBase, row.unit), qtyBase: row.requiredBase, unit: row.unit, cost: row.cost, date: today })) : []),
      ...current,
    ]);
    notify(`${batch.batchNo} finished. Finished goods increased`);
  }

  function cancelBatch(batch) {
    if (!canManageAll || !batch) {
      notify(batch ? "Admin permission required" : "Select a batch first");
      return;
    }
    if (batch.status === "Completed") {
      notify("Completed batches cannot be cancelled. Record any loss as wastage instead.");
      return;
    }
    if (batch.status === "Cancelled") {
      notify(`${batch.batchNo} is already cancelled`);
      return;
    }
    const returnedRequirements = batch.materialsIssued ? (batch.requirements || []) : [];
    if (returnedRequirements.length) {
      setInventory((current) => current.map((stockItem) => {
        const issued = returnedRequirements.find((row) => row.name === stockItem.name && unitsAreCompatible(row.unit, stockItem.unit));
        if (!issued) return stockItem;
        const restoredBase = toBaseQuantity(stockItem.stock, stockItem.unit) + Number(issued.requiredBase || 0);
        return { ...stockItem, stock: Number(fromBaseQuantity(restoredBase, stockItem.unit).toFixed(3)) };
      }));
      setTransactions((current) => [
        ...returnedRequirements.map((row, index) => ({
          id: `TRN-RETURN-${Date.now()}-${index}`,
          type: "Return",
          batchNo: batch.batchNo,
          recipeName: batch.recipeName,
          item: row.name,
          qty: formatProductionQty(row.requiredBase, row.unit),
          qtyBase: row.requiredBase,
          unit: row.unit,
          cost: row.cost,
          date: today,
        })),
        ...current,
      ]);
    }
    setBatches((current) => current.map((item) => item.id === batch.id ? { ...item, status: "Cancelled" } : item));
    notify(returnedRequirements.length ? `${batch.batchNo} cancelled. Issued ingredients returned to stock` : `${batch.batchNo} cancelled`);
  }

  function saveWastage() {
    if (!canManageAll) {
      notify("Wastage approval permission required");
      return;
    }
    if (!wastageStockItem) {
      notify("Select an inventory item for wastage");
      return;
    }
    const quantity = Number(wastageDraft.qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify("Enter a wastage quantity greater than zero");
      return;
    }
    if (!unitsAreCompatible(wastageDraft.unit, wastageStockItem.unit)) {
      notify("Select a unit that matches the inventory item");
      return;
    }
    const entry = { ...wastageDraft, id: `WST-${Date.now()}`, qty: quantity, cost: Number(wastageCost.toFixed(2)), approval: "Pending" };
    setWastageEntries((current) => [entry, ...current]);
    setWastageDraft({ item: "", reason: "Kitchen Waste", qty: 1, unit: "kg", cost: 0, person: "", approval: "Pending", date: today });
    notify("Wastage saved for approval");
  }

  function selectWastageItem(name) {
    const stockItem = inventory.find((item) => item.name === name);
    const unit = stockItem
      ? unitFamily(stockItem.unit) === "weight" ? "g" : unitFamily(stockItem.unit) === "volume" ? "ml" : normalizeProductionUnit(stockItem.unit)
      : "kg";
    setWastageDraft((current) => ({ ...current, item: name, unit }));
  }

  function reviewWastage(entry, approval) {
    if (!canManageAll || entry?.approval !== "Pending") {
      notify("Only pending wastage entries can be reviewed by an authorized user");
      return;
    }
    if (approval === "Approved") {
      const stockItem = inventory.find((item) => item.name === entry.item);
      const wastageBase = toBaseQuantity(entry.qty, entry.unit);
      const stockBase = stockItem ? toBaseQuantity(stockItem.stock, stockItem.unit) : 0;
      if (!stockItem || !unitsAreCompatible(entry.unit, stockItem.unit)) {
        notify("This wastage item no longer matches inventory and cannot be approved");
        return;
      }
      if (wastageBase > stockBase + 0.000001) {
        notify("Cannot approve wastage because available stock is insufficient");
        return;
      }
      setInventory((current) => current.map((item) => {
        if (item.name !== entry.item) return item;
        const remainingBase = toBaseQuantity(item.stock, item.unit) - wastageBase;
        return { ...item, stock: Number(fromBaseQuantity(remainingBase, item.unit).toFixed(3)) };
      }));
      setTransactions((current) => [{ id: `TRN-WST-${Date.now()}`, type: "Wastage", batchNo: "-", item: entry.item, qty: `${entry.qty} ${entry.unit}`, qtyBase: wastageBase, unit: entry.unit, cost: entry.cost, date: entry.date }, ...current]);
    }
    setWastageEntries((current) => current.map((item) => item.id === entry.id ? { ...item, approval, reviewedAt: new Date().toISOString() } : item));
    notify(`${entry.item} wastage ${approval.toLowerCase()}`);
  }

  function exportProductionReport(reportName = selectedProductionReport) {
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csvRows = [reportColumns[reportName] || [], ...(reports[reportName] || [])];
    const blob = new Blob([csvRows.map((row) => row.map(escapeCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vestora-${reportName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/(^-|-$)/g, "")}-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`${reportName} exported as CSV`);
  }

  function productionAction(action) {
    if (action === "New recipe") {
      switchProductionTab("Recipes");
      setRecipeDraft(blankRecipe);
      setSelectedRecipeId("");
    }
    if (action === "Plan") switchProductionTab("Planning");
    if (action === "Reports") switchProductionTab("Reports");
    if (action === "Export") exportProductionReport();
  }

  return (
    <section className="screen production-screen">
      <div className="metric-grid compact">
        <Metric icon={DatabaseZap} label="Recipes" value={String(recipes.length)} trend="BOM master" />
        <Metric icon={ChefHat} label="In production" value={String(inProgress)} trend="Live kitchen" />
        <Metric icon={PackageSearch} label="Finished today" value={String(completedToday.length)} trend={formatMoney(finishedValue)} />
        <Metric icon={Trash2} label="Wastage value" value={formatMoney(wastageValue)} trend="Needs approval" danger={wastageValue > 500} />
      </div>
      <div className="panel production-panel">
        <PanelHead title="Production & Recipe Management" icon={DatabaseZap} actions={["New recipe", "Plan", "Reports", "Export"]} onAction={productionAction} />
        <div className="production-alerts">
          <Insight title="Ingredient shortage" text={shortageRows.length ? `${shortageRows[0].name} is short for current plan.` : "Current plan has enough stock."} />
          <Insight title="Food cost" text={plannedRecipe ? `${plannedRecipe.name} plan cost is ${formatMoney(planCost)}.` : "Select a recipe to calculate cost."} />
          <Insight title="AI suggestion" text="Increase weekend biryani production by 22% and reorder chicken before dinner." />
        </div>

        {activeTab === "Recipes" && (
          <div className="production-layout production-recipe-layout">
            {!!recipes.length && <div className="module-list production-recipe-strip">{recipes.map((recipe) => <button key={recipe.id} className={recipe.id === selectedRecipeId ? "active-module" : ""} onClick={() => openRecipe(recipe)}><span>{recipe.name}</span><strong>v{recipe.version}</strong></button>)}</div>}
            {!recipes.length && <div className="production-empty-strip"><ChefHat size={18} /><strong>No recipes yet</strong><span>Create a recipe to start building your production master.</span></div>}
            <div className="production-editor">
              <div className="production-form recipe-master-form">
                <label>Recipe name<input value={recipeDraft.name} onChange={(event) => updateRecipe("name", event.target.value)} disabled={!canManageAll} placeholder="Chicken Biryani" /></label>
                <div className="production-category-field">
                  <div className="production-category-head">
                    <span>Category</span>
                    <button className="production-add-category" type="button" onClick={() => setCategoryCreatorOpen((open) => !open)} disabled={!canManageAll} aria-expanded={categoryCreatorOpen}>
                      <Plus size={14} /> New category
                    </button>
                  </div>
                  <select value={recipeDraft.category} onChange={(event) => updateRecipe("category", event.target.value)} disabled={!canManageAll}>{recipeCategories.map((category) => <option key={category}>{category}</option>)}</select>
                  {categoryCreatorOpen && (
                    <div className="production-inline-category">
                      <input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createRecipeCategory(); } }} placeholder="New category name" autoFocus />
                      <button type="button" onClick={createRecipeCategory}><Save size={15} /> Add</button>
                      <button type="button" className="cancel" onClick={() => { setCategoryCreatorOpen(false); setCategoryDraft(""); }} title="Cancel category" aria-label="Cancel category"><X size={15} /></button>
                    </div>
                  )}
                </div>
                <label>Portion<select value={recipeDraft.portion} onChange={(event) => updateRecipe("portion", event.target.value)} disabled={!canManageAll}>{Array.from(new Set([...productionPortionOptions, recipeDraft.portion].filter(Boolean))).map((portion) => <option key={portion}>{portion}</option>)}</select></label>
                <label>Output<input type="number" min="1" value={recipeDraft.outputQty} onChange={(event) => updateRecipe("outputQty", event.target.value)} disabled={!canManageAll} /></label>
                <label>Output unit<select value={recipeDraft.outputUnit} onChange={(event) => updateRecipe("outputUnit", event.target.value)} disabled={!canManageAll}>{Array.from(new Set([...productionOutputUnits, recipeDraft.outputUnit].filter(Boolean))).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                <label>Selling price<input type="number" min="0" value={recipeDraft.sellingPrice} onChange={(event) => updateRecipe("sellingPrice", event.target.value)} disabled={!canManageAll} /></label>
              </div>
              <div className="production-cost-strip">
                <span>Cost per portion <strong>{formatMoney(recipeCost)}</strong></span>
                <span>Gross profit <strong>{formatMoney(Number(recipeDraft.sellingPrice || 0) - recipeCost)}</strong></span>
                <span>Margin <strong>{recipeMargin}%</strong></span>
              </div>
              <div className="production-table">
                <table>
                  <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Available</th><th>Cost</th><th></th></tr></thead>
                  <tbody>{recipeDraft.ingredients.map((item, index) => {
                    const stockItem = inventory.find((ingredient) => ingredient.name === item.name);
                    const unitsMatch = stockItem && unitsAreCompatible(item.unit, stockItem.unit);
                    const compatibleUnits = stockItem ? productionUnits.filter((unit) => unitsAreCompatible(unit, stockItem.unit)) : productionUnits;
                    const availableQty = unitsMatch ? toBaseQuantity(stockItem.stock, stockItem.unit) / unitFactor(item.unit) : 0;
                    const lineCost = unitsMatch ? toBaseQuantity(item.qty, item.unit) * ingredientCostPerBase(stockItem) : 0;
                    return (
                      <tr key={`${item.name}-${index}`}>
                        <td><select value={item.name} onChange={(event) => selectRecipeIngredient(index, event.target.value)} disabled={!canManageAll}><option value="">Select item</option>{inventory.map((ingredient) => <option key={ingredient.id} value={ingredient.name}>{ingredient.name} ({ingredient.stock} {ingredient.unit})</option>)}</select></td>
                        <td><input type="number" min="0" value={item.qty} onChange={(event) => updateIngredient(index, "qty", event.target.value)} disabled={!canManageAll} /></td>
                        <td><select value={item.unit} onChange={(event) => updateIngredient(index, "unit", event.target.value)} disabled={!canManageAll}>{compatibleUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                        <td>{unitsMatch ? `${Number(availableQty.toFixed(3))} ${item.unit}` : stockItem ? "Choose a matching unit" : "-"}</td>
                        <td>{formatMoney(lineCost)}</td>
                        <td><button disabled={!canManageAll} onClick={() => setRecipeDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="production-actions">
                <button disabled={!canManageAll} onClick={() => setRecipeDraft((current) => ({ ...current, ingredients: [...current.ingredients, { name: "", qty: 1, unit: "g" }] }))}>Add ingredient</button>
                <button disabled={!canManageAll} onClick={saveRecipe}>Save recipe</button>
                <button disabled={!canManageAll || !recipeDraft.id} onClick={deleteRecipe}>Delete recipe</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Planning" && (
          <div className="production-layout production-planning-layout">
            <form className="production-form production-plan-form" onSubmit={(event) => { event.preventDefault(); startProduction(); }}>
              <label>Recipe<select value={recipes.some((recipe) => recipe.id === plan.recipeId) ? plan.recipeId : ""} onChange={(event) => { const recipe = recipes.find((item) => item.id === event.target.value); setPlan((current) => ({ ...current, recipeId: event.target.value, qty: Math.max(1, Number(recipe?.outputQty || 1)) })); }}><option value="">Select recipe</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label>
              <label>Quantity ({plannedRecipe?.outputUnit || "units"})<input type="number" min="1" value={plan.qty} onChange={(event) => setPlan((current) => ({ ...current, qty: event.target.value }))} /></label>
              <label>Batch name<select value={plan.batchName} onChange={(event) => setPlan((current) => ({ ...current, batchName: event.target.value }))}><option>Lunch Batch</option><option>Dinner Batch</option><option>Morning Batch</option><option>Weekend Batch</option><option>Festival Batch</option></select></label>
              <label>Batch number<input value={plan.batchNo} onChange={(event) => setPlan((current) => ({ ...current, batchNo: event.target.value }))} /></label>
              <label>Date<input type="date" value={plan.date} onChange={(event) => setPlan((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Start time<input type="time" value={plan.startTime} onChange={(event) => setPlan((current) => ({ ...current, startTime: event.target.value }))} /></label>
              <label>Chef<input value={plan.chef} onChange={(event) => setPlan((current) => ({ ...current, chef: event.target.value }))} /></label>
              <label>Kitchen<input value={plan.kitchen} onChange={(event) => setPlan((current) => ({ ...current, kitchen: event.target.value }))} /></label>
              <div className="production-actions"><button type="submit" disabled={!canManageAll}>Start production</button></div>
            </form>
            <div className="production-table">
              <table>
                <thead><tr><th>Ingredient</th><th>Required</th><th>Available</th><th>After</th><th>Status</th><th>Cost</th></tr></thead>
                <tbody>{planRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{formatProductionQty(row.requiredBase, row.unit)}</td><td>{formatProductionQty(row.stockBase, row.unit)}</td><td>{formatProductionQty(row.afterBase, row.unit)}</td><td><span className={row.status === "Short" ? "danger-chip" : "active-chip"}>{row.status}</span></td><td>{formatMoney(row.cost)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Batches" && (
          <div className="production-layout">
            <div className="production-table">
              <table>
                <thead><tr><th>Batch</th><th>Recipe</th><th>Qty</th><th>Chef</th><th>Status</th><th>Cost</th></tr></thead>
                <tbody>{batches.map((batch) => <tr key={batch.id} className={batch.id === selectedBatchId ? "selected-row" : ""} onClick={() => setSelectedBatchId(batch.id)}><td>{batch.batchNo}</td><td>{batch.recipeName}</td><td>{batch.qty}</td><td>{batch.chef}</td><td><span className="active-chip">{batch.status}</span></td><td>{formatMoney(batch.cost || 0)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="detail-panel">
              <h2>{selectedBatch?.batchNo || "Select batch"}</h2>
              <p>{selectedBatch ? `${selectedBatch.recipeName} / ${selectedBatch.batchName}` : "Open a batch to finish or cancel production."}</p>
              <p>Start: {selectedBatch?.startTime || "-"} / End: {selectedBatch?.endTime || "-"}</p>
              <p>Kitchen: {selectedBatch?.kitchen || "-"}</p>
              <div className="row-actions">
                <button disabled={!canManageAll || !selectedBatch || selectedBatch.status === "Completed"} onClick={() => finishProduction(selectedBatch)}>Finish production</button>
                <button disabled={!canManageAll || !selectedBatch || selectedBatch.status === "Completed"} onClick={() => cancelBatch(selectedBatch)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Wastage" && (
          <div className="wastage-layout">
            <form className="production-form wastage-form" onSubmit={(event) => { event.preventDefault(); saveWastage(); }}>
              <div className="wastage-form-heading"><div><span>NEW WASTAGE ENTRY</span><h3>Record kitchen wastage</h3></div><p>Select an inventory item to calculate the estimated cost.</p></div>
              <div className="wastage-form-fields">
                <label>Item<select value={inventory.some((item) => item.name === wastageDraft.item) ? wastageDraft.item : ""} onChange={(event) => selectWastageItem(event.target.value)}><option value="">Select item</option>{inventory.map((item) => <option key={item.id} value={item.name}>{item.name} ({item.stock} {item.unit})</option>)}</select></label>
                <label>Reason<select value={wastageDraft.reason} onChange={(event) => setWastageDraft((current) => ({ ...current, reason: event.target.value }))}>{["Cooking Loss", "Burnt Items", "Spoilage", "Expired", "Staff Consumption", "Free Sample", "Kitchen Waste"].map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                <label>Weight / qty<input type="number" min="0" value={wastageDraft.qty} onChange={(event) => setWastageDraft((current) => ({ ...current, qty: event.target.value }))} /></label>
                <label>Unit<select value={wastageDraft.unit} onChange={(event) => setWastageDraft((current) => ({ ...current, unit: event.target.value }))}>{wastageUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                <div className="wastage-cost-field"><span>Cost</span><strong>{formatMoney(wastageCost)}</strong></div>
                <label>Person responsible<input value={wastageDraft.person} onChange={(event) => setWastageDraft((current) => ({ ...current, person: event.target.value }))} /></label>
                <label>Date<input type="date" value={wastageDraft.date} onChange={(event) => setWastageDraft((current) => ({ ...current, date: event.target.value }))} /></label>
                <div className="production-actions"><button type="submit" disabled={!canManageAll}>Save wastage</button></div>
              </div>
            </form>
            <div className="production-table">
              <table>
                <thead><tr><th>Date</th><th>Item</th><th>Reason</th><th>Qty</th><th>Cost</th><th>Approval</th></tr></thead>
                <tbody>{wastageEntries.map((entry) => <tr key={entry.id}><td>{entry.date}</td><td>{entry.item}</td><td>{entry.reason}</td><td>{entry.qty} {entry.unit}</td><td>{formatMoney(entry.cost || 0)}</td><td><div className="wastage-approval-cell"><span className={entry.approval === "Rejected" ? "danger-chip" : "active-chip"}>{entry.approval}</span>{canManageAll && entry.approval === "Pending" && <div className="wastage-review-actions"><button type="button" className="approve" onClick={() => reviewWastage(entry, "Approved")}><CircleCheck size={14} /> Approve</button><button type="button" className="reject" onClick={() => reviewWastage(entry, "Rejected")}><X size={14} /> Reject</button></div>}</div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Reports" && (
          <div className="production-report-grid">
            {selectedProductionReport === "Ingredient Consumption" && <div className="production-table production-consumption-summary">
              <div className="production-report-head"><h3>Daily ingredient total</h3></div>
              <table>
                <thead><tr><th>Date</th><th>Ingredient</th><th>Food items</th><th>Total consumed</th><th>Batches</th><th>Total cost</th></tr></thead>
                <tbody>{dailyConsumptionRows.length ? dailyConsumptionRows.map((row) => <tr key={`${row[0]}-${row[1]}`}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>) : <tr><td colSpan="6">No consumption recorded</td></tr>}</tbody>
              </table>
            </div>}
            {Object.entries(reports).filter(([title]) => title === selectedProductionReport).map(([title, rows]) => (
              <div className="production-table" key={title}>
                <div className="production-report-head"><h3>{title}</h3><button type="button" onClick={() => exportProductionReport(title)}><Download size={15} /> Export CSV</button></div>
                <table>
                  <thead><tr>{(reportColumns[title] || []).map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>{rows.length ? rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={(reportColumns[title] || []).length}>No data available</td></tr>}</tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CRM({ notify, canManageAll, salesLedger = [] }) {
  const customers = new Map();
  salesLedger.forEach((bill) => {
    const name = String(bill.customerName || "").trim();
    const mobile = String(bill.customerMobile || "").replace(/\D/g, "").slice(-10);
    if (!name && !mobile) return;
    const key = mobile || name.toLowerCase();
    const current = customers.get(key) || { name: name || "Customer", mobile, points: 0, itemCounts: new Map() };
    current.name = name || current.name;
    current.mobile = mobile || current.mobile;
    current.points += Math.round(Number(bill.total || 0));
    (bill.items || []).forEach((item) => current.itemCounts.set(item.name, (current.itemCounts.get(item.name) || 0) + Number(item.qty || 0)));
    customers.set(key, current);
  });
  const rows = Array.from(customers.values())
    .map((customer) => {
      const favourite = Array.from(customer.itemCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      return [customer.name, customer.mobile ? `+91 ${customer.mobile}` : "Not provided", String(customer.points), favourite];
    })
    .sort((a, b) => Number(b[2]) - Number(a[2]));
  return <DataTable title="Customer CRM" icon={Users} columns={["Customer", "Mobile", "Loyalty", "Favourite"]} rows={rows} notify={notify} canManageAll={canManageAll} emptyMessage="No customer details yet. Complete a bill with customer name or mobile to add it here." />;
}

function ProductItemsManager({ items, setItems, notify, canManageAll, menuCategories = [], onCreateCategory, mode = "items", editingItemId = "", onNavigate }) {
  const blankDraft = { name: "", category: "Mains", barcode: "", price: "", tax: 5, fav: false, status: "Active", image: "" };
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(() => ({ ...blankDraft, id: "" }));
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const selectedItem = items.find((item) => item.id === selectedId);
  const categories = Array.from(new Set(["Mains", "Beverages", "Dessert", "Snacks", "Combo", ...menuCategories, ...items.map((item) => item.category).filter(Boolean)]));

  useEffect(() => {
    if (mode !== "create") return;
    const itemToEdit = items.find((item) => String(item.id) === String(editingItemId));
    setSelectedId(itemToEdit?.id || "");
    setDraft(itemToEdit ? { ...itemToEdit } : { ...blankDraft, id: "" });
  }, [mode, editingItemId]);

  function selectItem(item) {
    onNavigate("create", item.id);
  }

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function createCategory() {
    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      notify("Enter a category name");
      return;
    }
    const existingCategory = categories.find((category) => category.toLowerCase() === categoryName.toLowerCase());
    if (existingCategory) {
      update("category", existingCategory);
      setNewCategoryName("");
      setShowCategoryCreator(false);
      notify(`${existingCategory} category selected`);
      return;
    }
    onCreateCategory?.(categoryName);
    update("category", categoryName);
    setNewCategoryName("");
    setShowCategoryCreator(false);
    notify(`${categoryName} category created and selected`);
  }

  function uploadItemPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Choose a valid image file");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Item photo must be smaller than 2 MB");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("image", String(reader.result || ""));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function saveItem() {
    if (!canManageAll) {
      notify("Admin permission required to save product rate");
      return;
    }
    if (!draft.name.trim()) {
      notify("Enter product item name");
      return;
    }
    const barcode = String(draft.barcode || "").trim();
    if (barcode && items.some((item) => String(item.id) !== String(draft.id) && String(item.barcode || "").trim().toLowerCase() === barcode.toLowerCase())) {
      notify("Barcode already assigned to another item");
      return;
    }
    const savedItem = {
      ...draft,
      id: draft.id || `ITEM-${Date.now()}`,
      name: draft.name.trim(),
      category: draft.category.trim() || "Mains",
      barcode,
      price: Number(draft.price || 0),
      tax: Number(draft.tax || 0),
      fav: Boolean(draft.fav),
      status: draft.status || "Active",
    };
    setItems((current) => current.some((item) => item.id === savedItem.id) ? current.map((item) => item.id === savedItem.id ? savedItem : item) : [savedItem, ...current]);
    setSelectedId("");
    setDraft({ ...blankDraft, id: "" });
    setShowCategoryCreator(false);
    setNewCategoryName("");
    notify(`${savedItem.name} rate saved at ${formatMoney(savedItem.price)}`);
  }

  function deleteItem() {
    if (!canManageAll) {
      notify("Admin permission required to delete product item");
      return;
    }
    if (!selectedItem) {
      notify("Select item first");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== selectedItem.id));
    notify(`${selectedItem.name} deleted`);
    onNavigate("items");
  }

  if (mode === "items") {
    return (
      <div className="panel product-master-panel product-list-panel">
        <PanelHead title="Menu items" icon={PackageSearch} actions={canManageAll ? ["Create item"] : []} onAction={() => onNavigate("create")} />
        <div className="product-master-table">
          <table>
            <thead><tr><th>Image</th><th>Item</th><th>Category</th><th>Barcode</th><th>Rate</th><th>GST</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id}>
                <td><img className="product-master-thumb" src={getMenuItemPhoto(item)} alt="" /></td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.barcode ? <span className="product-barcode-chip">{item.barcode}</span> : <span className="muted-table-value">Optional</span>}</td>
                <td>{formatMoney(item.price)}</td>
                <td>{item.tax}%</td>
                <td><span className="active-chip">{item.status || "Active"}</span></td>
                <td><button className="icon-btn table-edit-btn" type="button" onClick={() => selectItem(item)} title={`Edit ${item.name}`}><Pencil size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {!items.length && <div className="empty-table-state"><PackageSearch size={24} /><strong>No menu items yet</strong><span>Create the first item for this branch.</span></div>}
          {!canManageAll && <p className="permission-note">View only. Admin permission is required to add items or edit product rates.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel product-master-panel product-create-panel">
      <PanelHead title={selectedItem ? "Edit menu item" : "Create menu item"} icon={ReceiptText} />
      <div className="product-master-layout product-create-layout">
        <form className="product-master-form" onSubmit={(event) => { event.preventDefault(); saveItem(); }}>
          <aside className="product-photo-panel">
            <div className="product-photo-preview">
              <img src={getMenuItemPhoto(draft)} alt="" />
              <span className={draft.status === "Inactive" ? "product-preview-status inactive" : "product-preview-status"}>{draft.status || "Active"}</span>
            </div>
            <div className="product-preview-copy">
              <span>{draft.category || "Category"}</span>
              <strong>{draft.name.trim() || "New menu item"}</strong>
              {draft.barcode && <small>Barcode {draft.barcode}</small>}
              <b>{draft.price === "" ? "Set item rate" : formatMoney(Number(draft.price || 0))}</b>
            </div>
            <label className="product-photo-upload">
              <Upload size={17} />
              {draft.image ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadItemPhoto} disabled={!canManageAll} />
            </label>
            {draft.image && <button className="product-photo-remove" type="button" onClick={() => update("image", "")} disabled={!canManageAll}><Trash2 size={15} /> Remove photo</button>}
            <small>PNG, JPG or WebP. Maximum 2 MB.</small>
          </aside>

          <div className="product-form-content">
            <section className="product-form-section">
              <div className="product-form-section-head"><div><span>Item details</span><small>Name and menu grouping</small></div></div>
              <div className="product-form-grid">
                <label className="product-field-wide">Item name<input value={draft.name} onChange={(event) => update("name", event.target.value)} disabled={!canManageAll} placeholder="Chicken Biryani" autoFocus /></label>
                <label>Barcode <small>Optional</small><input value={draft.barcode || ""} onChange={(event) => update("barcode", event.target.value)} disabled={!canManageAll} placeholder="Scan or type barcode" /></label>
                <div className="product-category-field">
                  <div className="product-category-head">
                    <span>Category</span>
                    <button className="product-add-category" type="button" onClick={() => setShowCategoryCreator((current) => !current)} disabled={!canManageAll} aria-expanded={showCategoryCreator}>
                      <Plus size={14} /> New category
                    </button>
                  </div>
                  <select value={draft.category} onChange={(event) => update("category", event.target.value)} disabled={!canManageAll}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
                  {showCategoryCreator && (
                    <div className="product-category-creator">
                      <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createCategory(); } }} placeholder="Category name" autoFocus />
                      <button type="button" onClick={createCategory}><Save size={15} /> Add</button>
                      <button type="button" className="icon-btn" onClick={() => { setShowCategoryCreator(false); setNewCategoryName(""); }} title="Cancel category creation"><X size={16} /></button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="product-form-section">
              <div className="product-form-section-head"><div><span>Pricing & tax</span><small>Customer price and GST rate</small></div></div>
              <div className="product-form-grid">
                <label>Product rate<div className="product-input-prefix"><span>₹</span><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update("price", event.target.value)} disabled={!canManageAll} placeholder="0.00" /></div></label>
                <label>GST rate<div className="product-input-suffix"><input type="number" min="0" max="100" step="0.01" value={draft.tax} onChange={(event) => update("tax", event.target.value)} disabled={!canManageAll} /><span>%</span></div></label>
              </div>
              <div className="product-tax-note"><Percent size={16} /><span>GST will appear as CGST {Number(draft.tax || 0) / 2}% + SGST {Number(draft.tax || 0) / 2}% on the bill.</span></div>
            </section>

            <section className="product-form-section product-availability-section">
              <div className="product-form-section-head"><div><span>Availability</span><small>Control where the item is shown</small></div></div>
              <div className="product-option-row">
                <div><strong>Available for ordering</strong><small>Show this item in POS and waiter ordering.</small></div>
                <label className="product-toggle"><input type="checkbox" checked={draft.status !== "Inactive"} onChange={(event) => update("status", event.target.checked ? "Active" : "Inactive")} disabled={!canManageAll} /><span /></label>
              </div>
              <div className="product-option-row">
                <div><strong>Favourite item</strong><small>Keep it in the quick-access Favourites category.</small></div>
                <label className="product-toggle"><input type="checkbox" checked={Boolean(draft.fav)} onChange={(event) => update("fav", event.target.checked)} disabled={!canManageAll} /><span /></label>
              </div>
            </section>
          </div>

          <div className="product-master-actions">
            <button className="product-back-action" type="button" onClick={() => onNavigate("items")}>
              <ArrowLeft size={17} />
              Back to items
            </button>
            {selectedItem && (
              <button className="product-delete-action" type="button" onClick={deleteItem} disabled={!canManageAll}>
                <Trash2 size={17} />
                Delete item
              </button>
            )}
            <button className="product-save-action" type="submit" disabled={!canManageAll}>
              <Save size={17} />
              {selectedItem ? "Save changes" : "Save item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MenuManagement({ notify, canManageAll, storeId, productItems, setProductItems, activeView = "items", editingItemId = "", onNavigate }) {
  const sectionNames = Object.keys(menuSectionConfig);
  const [activeSection, setActiveSection] = useState(sectionNames[0]);
  const [records, setRecords] = useState(() => {
    const saved = localStorage.getItem(`vestora-menu-setup-${storeId}`);
    return saved ? JSON.parse(saved) : Object.fromEntries(sectionNames.map((name) => [name, menuSectionConfig[name].rows]));
  });
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(menuSectionConfig[activeSection].sample);
  const [recordSearch, setRecordSearch] = useState("");
  const [showRecordEditor, setShowRecordEditor] = useState(false);
  const importInputRef = useRef(null);
  const config = menuSectionConfig[activeSection];
  const rows = records[activeSection] || [];
  const selectedRecord = rows.find((row) => row.id === selectedId);
  const visibleRows = rows.filter((row) => config.fields.some(([field]) => String(row[field] || "").toLowerCase().includes(recordSearch.trim().toLowerCase())));
  const sectionHelp = {
    Categories: "Main groups shown in POS and waiter ordering.",
    Subcategories: "Organize related items inside each category.",
    Variants: "Offer item sizes or portions with price changes.",
    Modifiers: "Add optional extras and kitchen instructions.",
    Combos: "Bundle multiple menu items at one selling price.",
    "Printer mapping": "Route categories to the correct KOT printer.",
    "Nutritional info": "Maintain calories and allergen information.",
  };

  useEffect(() => {
    localStorage.setItem(`vestora-menu-setup-${storeId}`, JSON.stringify(records));
  }, [records, storeId]);

  function openSection(name) {
    setActiveSection(name);
    setRecordSearch("");
    setSelectedId(null);
    setDraft({ ...menuSectionConfig[name].sample });
    setShowRecordEditor(false);
  }

  function startNew() {
    if (!canManageAll) {
      notify("Admin permission required to create menu setup");
      return;
    }
    setSelectedId(null);
    setDraft({ ...config.sample });
    setShowRecordEditor(true);
    notify(`New ${activeSection} entry ready`);
  }

  function selectRecord(row) {
    setSelectedId(row.id);
    setDraft({ ...row });
    setShowRecordEditor(true);
    notify(`${row.name || row.item || row.section} opened`);
  }

  function closeRecordEditor() {
    setSelectedId(null);
    setDraft({ ...config.sample });
    setShowRecordEditor(false);
  }

  function createItemCategory(name) {
    const cleanedName = name.trim();
    if (!cleanedName) return;
    setRecords((current) => {
      const currentCategories = current.Categories || [];
      if (currentCategories.some((entry) => String(entry.name || "").toLowerCase() === cleanedName.toLowerCase())) return current;
      const codeBase = cleanedName.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "CAT";
      let code = codeBase;
      let suffix = 2;
      while (currentCategories.some((entry) => String(entry.code || "").toUpperCase() === code)) code = `${codeBase}${suffix++}`;
      return {
        ...current,
        Categories: [{ id: Date.now(), name: cleanedName, code, status: "Active" }, ...currentCategories],
      };
    });
  }

  function saveRecord() {
    if (!canManageAll) {
      notify("Admin permission required to save menu setup");
      return;
    }
    const hasValue = config.fields.some(([field]) => String(draft[field] || "").trim());
    if (!hasValue) {
      notify("Enter menu setup details");
      return;
    }
    const saved = { ...draft, id: selectedId || Date.now() };
    setRecords((current) => {
      const currentRows = current[activeSection] || [];
      const exists = currentRows.some((row) => row.id === saved.id);
      return {
        ...current,
        [activeSection]: exists ? currentRows.map((row) => row.id === saved.id ? saved : row) : [saved, ...currentRows],
      };
    });
    closeRecordEditor();
    notify(`${activeSection} saved`);
  }

  function deleteRecord() {
    if (!canManageAll) {
      notify("Admin permission required to delete menu setup");
      return;
    }
    if (!selectedId) {
      notify("Select a record first");
      return;
    }
    if (!window.confirm(`Delete this ${activeSection.toLowerCase()} record?`)) return;
    setRecords((current) => {
      const nextRows = (current[activeSection] || []).filter((row) => row.id !== selectedId);
      return { ...current, [activeSection]: nextRows };
    });
    closeRecordEditor();
    notify(`${activeSection} deleted`);
  }

  async function importSection(event) {
    if (!canManageAll) {
      notify("Admin permission required to import menu setup");
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported) || !imported.length) throw new Error("No records found");
      const normalized = imported.map((entry, index) => ({
        id: entry.id || Date.now() + index,
        ...Object.fromEntries(config.fields.map(([field]) => [field, String(entry[field] ?? "").trim()])),
      }));
      setRecords((current) => ({ ...current, [activeSection]: normalized }));
      setSelectedId(null);
      setDraft({ ...config.sample });
      setShowRecordEditor(false);
      notify(`${normalized.length} ${activeSection.toLowerCase()} records imported`);
    } catch {
      notify("Choose a valid Vestora JSON export");
    }
  }

  function exportSection() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeSection.toLowerCase().replaceAll(" ", "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify(`${activeSection} exported`);
  }

  return (
    <section className="screen">
      {(activeView === "items" || activeView === "create") && <ProductItemsManager items={productItems} setItems={setProductItems} notify={notify} canManageAll={canManageAll} menuCategories={(records.Categories || []).filter((entry) => entry.status !== "Inactive").map((entry) => entry.name).filter(Boolean)} onCreateCategory={createItemCategory} mode={activeView} editingItemId={editingItemId} onNavigate={onNavigate} />}
      {activeView === "setup" && <div className="menu-setup-page">
        <input ref={importInputRef} className="menu-import-input" type="file" accept="application/json,.json" onChange={importSection} />
        <header className="menu-setup-header">
          <div><p>Menu configuration</p><h2>Build how items are sold and prepared</h2><span>Manage categories, choices, combos, KOT routing, and nutrition for this branch.</span></div>
          <div className="menu-setup-header-actions">
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={!canManageAll}><Upload size={17} /> Import</button>
            <button type="button" onClick={exportSection}><Download size={17} /> Export</button>
            <button className="primary-table-action" type="button" onClick={startNew} disabled={!canManageAll}><Plus size={17} /> New record</button>
          </div>
        </header>
        <div className="menu-admin-grid">
          <aside className="panel menu-admin-sidebar">
            <div className="menu-section-title"><ClipboardList size={20} /><div><strong>Setup sections</strong><span>Select what you want to configure</span></div></div>
            <div className="menu-section-list">
              {sectionNames.map((name) => {
                const sectionRows = records[name] || [];
                return <button type="button" key={name} className={activeSection === name ? "active-module" : ""} onClick={() => openSection(name)}>
                  <span><strong>{name}</strong><small>{sectionHelp[name]}</small></span>
                  <em>{sectionRows.length}</em>
                </button>;
              })}
            </div>
          </aside>
          <main className="panel menu-admin-detail">
            {showRecordEditor && <div className="menu-record-editor">
              <div className="menu-editor-head">
                <div className="menu-editor-icon"><Gauge size={21} /></div>
                <div><p>{selectedRecord ? "Editing record" : "New record"}</p><h3>{activeSection}</h3><span>{sectionHelp[activeSection]}</span></div>
                {selectedRecord && <span className="menu-record-state">Saved</span>}
              </div>
              <div className="menu-form-shell">
                <div className="menu-form-grid">
                  {config.fields.map(([field, label]) => (
                    <label key={field}>{label}
                      {field === "status" ? <select value={draft[field] || "Active"} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} disabled={!canManageAll}><option>Active</option><option>Inactive</option></select> : <input value={draft[field] || ""} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} disabled={!canManageAll} placeholder={`Enter ${label.toLowerCase()}`} />}
                    </label>
                  ))}
                </div>
                {!canManageAll && <p className="permission-note">View only. Admin permission is required to add, edit, or delete menu setup.</p>}
                <div className="menu-editor-actions">
                  {selectedRecord && <button className="menu-delete-record" type="button" onClick={deleteRecord} disabled={!canManageAll}><Trash2 size={16} /> Delete</button>}
                  <button type="button" onClick={closeRecordEditor}>Cancel</button>
                  <button className="primary-table-action" type="button" onClick={saveRecord} disabled={!canManageAll}><Save size={16} /> {selectedRecord ? "Save changes" : "Create record"}</button>
                </div>
              </div>
            </div>}
            <section className="menu-records-section">
              <div className="menu-records-head">
                <div><strong>{activeSection} records</strong><span>{rows.length} configured</span></div>
                <label className="menu-record-search"><Search size={16} /><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder={`Search ${activeSection.toLowerCase()}`} /></label>
              </div>
              <div className="menu-record-table">
                <table>
                  <thead><tr>{config.columns.map((column) => <th key={column}>{column}</th>)}<th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {visibleRows.length === 0 && <tr><td className="menu-empty-records" colSpan={config.columns.length + 1}>No matching records</td></tr>}
                    {visibleRows.map((row) => (
                      <tr key={row.id} className={selectedId === row.id ? "selected-row" : ""} onClick={() => selectRecord(row)}>
                        {config.fields.map(([field]) => <td key={field}>{field === "status" ? <span className={`active-chip ${row[field] === "Inactive" ? "inactive" : ""}`}>{row[field] || "Active"}</span> : row[field]}</td>)}
                        <td><button className="menu-row-edit" type="button" title="Edit record" aria-label={`Edit ${row.name || row.item || row.section || activeSection}`} onClick={(event) => { event.stopPropagation(); selectRecord(row); }}><Pencil size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>}
    </section>
  );
}

function Finance({ notify, canManageAll, salesLedger, refundLedger = [], storeId, view = "Expenses" }) {
  const expenseStorageKey = `vestora-finance-expenses-${storeId}`;
  const emptyExpense = () => ({ category: "", amount: "", paidFrom: "Cash", status: "Posted", date: localDateKey(), reference: "", note: "" });
  const [expenses, setExpenses] = useState(() => loadStoredArray(expenseStorageKey));
  const [expenseDraft, setExpenseDraft] = useState(emptyExpense);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [ledgerFormOpen, setLedgerFormOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState({ date: localDateKey(), debitAccount: "", creditAccount: "", amount: "", reference: "", note: "" });
  const [filters, setFilters] = useState({ query: "", method: "All", status: "All", from: "", to: "" });

  useEffect(() => {
    setExpenses(loadStoredArray(expenseStorageKey));
    setExpenseDraft(emptyExpense());
    setEditingExpenseId(null);
    setFormOpen(false);
  }, [expenseStorageKey]);

  function updateExpenses(nextValue) {
    setExpenses((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      localStorage.setItem(expenseStorageKey, JSON.stringify(next));
      return next;
    });
  }

  function openNewExpense() {
    if (!canManageAll) {
      notify("Only an administrator can manage expenses");
      return;
    }
    setEditingExpenseId(null);
    setExpenseDraft(emptyExpense());
    setFormOpen(true);
  }

  function saveExpense(event) {
    event.preventDefault();
    const category = expenseDraft.category.trim();
    const amount = Number(expenseDraft.amount);
    if (!category || !Number.isFinite(amount) || amount <= 0) {
      notify("Enter an expense category and a valid amount");
      return;
    }
    const record = {
      id: editingExpenseId || `EXP-${Date.now()}`,
      category,
      amount,
      paidFrom: expenseDraft.paidFrom,
      status: expenseDraft.status,
      date: expenseDraft.date || localDateKey(),
      reference: expenseDraft.reference.trim(),
      note: expenseDraft.note.trim(),
      updatedAt: new Date().toISOString(),
    };
    updateExpenses((current) => editingExpenseId
      ? current.map((expense) => expense.id === editingExpenseId ? record : expense)
      : [record, ...current]);
    notify(editingExpenseId ? "Expense updated" : "Expense added");
    setEditingExpenseId(null);
    setExpenseDraft(emptyExpense());
    setFormOpen(false);
  }

  function editExpense(expense) {
    if (!canManageAll) {
      notify("Only an administrator can manage expenses");
      return;
    }
    setEditingExpenseId(expense.id);
    setExpenseDraft({
      category: expense.category || "",
      amount: String(expense.amount || ""),
      paidFrom: expense.paidFrom || "Cash",
      status: expense.status || "Posted",
      date: expense.date || localDateKey(),
      reference: expense.reference || "",
      note: expense.note || "",
    });
    setFormOpen(true);
  }

  function deleteExpense(expense) {
    if (!canManageAll) {
      notify("Only an administrator can manage expenses");
      return;
    }
    if (!window.confirm(`Delete ${expense.category} expense?`)) return;
    updateExpenses((current) => current.filter((item) => item.id !== expense.id));
    notify("Expense deleted");
  }

  const filteredExpenses = expenses.filter((expense) => {
    const searchText = `${expense.category} ${expense.reference} ${expense.note} ${expense.paidFrom}`.toLowerCase();
    return (!filters.query || searchText.includes(filters.query.toLowerCase()))
      && (filters.method === "All" || expense.paidFrom === filters.method)
      && (filters.status === "All" || expense.status === filters.status)
      && (!filters.from || expense.date >= filters.from)
      && (!filters.to || expense.date <= filters.to);
  });
  const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paymentAmount = (bill, method) => bill.payment === "Split"
    ? Number((bill.splitPayments || []).find((entry) => entry.method === method)?.amount || 0)
    : bill.payment === method ? Number(bill.total || 0) : 0;
  const ledgerSales = salesLedger.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const ledgerTax = salesLedger.reduce((sum, bill) => sum + Number(bill.tax || 0), 0);
  const refundsTotal = refundLedger.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const cashReceipts = salesLedger.reduce((sum, bill) => sum + paymentAmount(bill, "Cash"), 0);
  const cashRefunds = refundLedger.filter((refund) => refund.payment === "Cash").reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const creditReceivables = salesLedger.reduce((sum, bill) => sum + paymentAmount(bill, "Credit"), 0)
    - refundLedger.filter((refund) => refund.payment === "Credit").reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const netCreditReceivables = Math.max(creditReceivables, 0);
  const netSales = ledgerSales - refundsTotal;
  const refundedTax = refundLedger.reduce((sum, refund) => {
    if (Number.isFinite(Number(refund.taxAmount))) return sum + Number(refund.taxAmount);
    const bill = salesLedger.find((entry) => entry.id === refund.billId || entry.orderNumber === refund.billId);
    return sum + (bill?.total ? Number(bill.tax || 0) * (Number(refund.amount || 0) / Number(bill.total)) : 0);
  }, 0);
  const netGst = Math.max(ledgerTax - refundedTax, 0);
  if (view !== "Expenses") {
    return <FinanceExtendedView view={view} notify={notify} canManageAll={canManageAll} storeId={storeId} expenses={expenses} netSales={netSales} netGst={netGst} cashCollected={cashReceipts - cashRefunds} receivables={netCreditReceivables} />;
  }
  return (
    <section className="screen">
      <div className="metric-grid compact">
        <Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(netSales)} trend={`Gross ${formatMoney(ledgerSales)}`} />
        <Metric icon={CreditCard} label="Cash collected" value={formatMoney(cashReceipts - cashRefunds)} trend={cashRefunds ? `Refunds ${formatMoney(cashRefunds)}` : "No cash refunds"} />
        <Metric icon={DatabaseZap} label="Expenses" value={formatMoney(expenseTotal)} trend={filteredExpenses.length ? `${filteredExpenses.length} expense records` : "No expenses in this range"} />
        <Metric icon={ReceiptText} label="Net GST" value={formatMoney(netGst)} trend={refundedTax ? `Refund GST ${formatMoney(refundedTax)}` : "No refunds"} />
      </div>
      <section className="panel finance-workspace">
        <div className="panel-head finance-head">
          <div><BadgeIndianRupee /><h2>Expense & Finance</h2></div>
          <div className="finance-actions">
            <button onClick={openNewExpense}><Plus size={18} />Add expense</button>
            <button className={filtersOpen ? "active-action" : ""} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} />Filter</button>
            <button className={rangeOpen ? "active-action" : ""} onClick={() => setRangeOpen((open) => !open)}><CalendarClock size={18} />Date range</button>
            <button onClick={() => downloadCsv("vestora-expenses.csv", ["Date", "Category", "Amount", "Paid from", "Status", "Reference", "Note"], filteredExpenses.map((expense) => ({ Date: expense.date, Category: expense.category, Amount: expense.amount, "Paid from": expense.paidFrom, Status: expense.status, Reference: expense.reference, Note: expense.note })))}><Download size={18} />Export</button>
          </div>
        </div>

        {(filtersOpen || rangeOpen) && <div className="finance-filter-row">
          {filtersOpen && <>
            <label className="finance-search"><Search size={18} /><input placeholder="Search expense, reference, note" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>
            <label>Paid from<select value={filters.method} onChange={(event) => setFilters((current) => ({ ...current, method: event.target.value }))}><option>All</option><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option></select></label>
            <label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option>All</option><option>Posted</option><option>Review</option><option>Pending</option><option>Paid</option></select></label>
          </>}
          {rangeOpen && <>
            <label>Start date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
            <label>End date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          </>}
          <button className="text-action" onClick={() => setFilters({ query: "", method: "All", status: "All", from: "", to: "" })}>Clear filters</button>
        </div>}

        {formOpen && <form className="finance-expense-form" onSubmit={saveExpense}>
          <div className="finance-form-title"><div><span>{editingExpenseId ? "Update expense" : "New expense"}</span><strong>{editingExpenseId ? "Edit expense details" : "Record a business expense"}</strong></div><button type="button" className="icon-button" title="Close expense form" onClick={() => { setFormOpen(false); setEditingExpenseId(null); setExpenseDraft(emptyExpense()); }}><X size={18} /></button></div>
          <label>Category<input autoFocus placeholder="Rent, salary, supplies" value={expenseDraft.category} onChange={(event) => setExpenseDraft((current) => ({ ...current, category: event.target.value }))} /></label>
          <label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label>Paid from<select value={expenseDraft.paidFrom} onChange={(event) => setExpenseDraft((current) => ({ ...current, paidFrom: event.target.value }))}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option></select></label>
          <label>Status<select value={expenseDraft.status} onChange={(event) => setExpenseDraft((current) => ({ ...current, status: event.target.value }))}><option>Posted</option><option>Review</option><option>Pending</option><option>Paid</option></select></label>
          <label>Date<input type="date" value={expenseDraft.date} onChange={(event) => setExpenseDraft((current) => ({ ...current, date: event.target.value }))} /></label>
          <label>Reference<input placeholder="Invoice or receipt number" value={expenseDraft.reference} onChange={(event) => setExpenseDraft((current) => ({ ...current, reference: event.target.value }))} /></label>
          <label className="finance-note">Notes<input placeholder="Optional note" value={expenseDraft.note} onChange={(event) => setExpenseDraft((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="finance-form-actions"><button type="button" onClick={() => { setFormOpen(false); setEditingExpenseId(null); setExpenseDraft(emptyExpense()); }}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />{editingExpenseId ? "Save changes" : "Save expense"}</button></div>
        </form>}

        <div className="finance-summary"><span>Receivables <strong>{formatMoney(netCreditReceivables)}</strong></span><span>Showing <strong>{filteredExpenses.length}</strong> expenses</span><span>Total <strong>{formatMoney(expenseTotal)}</strong></span></div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Paid from</th><th>Status</th><th>Reference</th><th>Actions</th></tr></thead>
            <tbody>{filteredExpenses.length ? filteredExpenses.map((expense) => <tr key={expense.id}><td>{expense.date || "-"}</td><td><strong>{expense.category}</strong>{expense.note && <small>{expense.note}</small>}</td><td>{formatMoney(expense.amount)}</td><td>{expense.paidFrom}</td><td><span className={`status-pill ${String(expense.status).toLowerCase()}`}>{expense.status}</span></td><td>{expense.reference || "-"}</td><td><div className="row-actions"><button title="Edit expense" onClick={() => editExpense(expense)}><Pencil size={17} />Edit</button><button className="danger-action" title="Delete expense" onClick={() => deleteExpense(expense)}><Trash2 size={17} />Delete</button></div></td></tr>) : <tr><td colSpan="7" className="finance-empty">No expense records match this view.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function FinanceExtendedView({ view, notify, canManageAll, storeId, expenses, netSales, netGst, cashCollected, receivables }) {
  const keyByView = {
    Receipts: `vestora-finance-receipts-${storeId}`,
    "Bank Accounts": `vestora-finance-bank-accounts-${storeId}`,
    "Vendor Payments": `vestora-finance-vendor-payments-${storeId}`,
    "Journal Entries": `vestora-finance-journals-${storeId}`,
  };
  const storageKey = keyByView[view] || "";
  const blank = () => view === "Receipts"
    ? { customer: "", amount: "", method: "Cash", status: "Received", date: localDateKey(), reference: "", note: "" }
    : view === "Bank Accounts"
      ? { accountName: "", bankName: "", accountNumber: "", openingBalance: "", status: "Active", note: "" }
      : view === "Vendor Payments"
        ? { vendor: "", invoice: "", dueAmount: "", amount: "", method: "Bank", status: "Paid", date: localDateKey(), reference: "", note: "" }
      : { date: localDateKey(), debitAccount: "", creditAccount: "", amount: "", status: "Posted", reference: "", note: "" };
  const [records, setRecords] = useState(() => storageKey ? loadStoredArray(storageKey) : []);
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filters, setFilters] = useState({ query: "", method: "All", status: "All", from: "", to: "" });
  const [reportRecords, setReportRecords] = useState({ receipts: [], banks: [], vendors: [], journals: [] });

  useEffect(() => {
    setRecords(storageKey ? loadStoredArray(storageKey) : []);
    setDraft(blank());
    setEditingId("");
    setFormOpen(false);
    setFiltersOpen(false);
    setRangeOpen(false);
    setLedgerFormOpen(false);
    setLedgerDraft({ date: localDateKey(), debitAccount: "", creditAccount: "", amount: "", reference: "", note: "" });
    setFilters({ query: "", method: "All", status: "All", from: "", to: "" });
    setReportRecords({
      receipts: loadStoredArray(`vestora-finance-receipts-${storeId}`),
      banks: loadStoredArray(`vestora-finance-bank-accounts-${storeId}`),
      vendors: loadStoredArray(`vestora-finance-vendor-payments-${storeId}`),
      journals: loadStoredArray(`vestora-finance-journals-${storeId}`),
    });
  }, [storeId, view]);

  const isReports = view === "Finance Reports";
  const title = isReports ? "Finance reports" : view;
  const singular = view === "Receipts" ? "Receipt" : view === "Bank Accounts" ? "Bank account" : view === "Vendor Payments" ? "Vendor payment" : "Journal entry";
  const statuses = view === "Receipts" ? ["Received", "Pending", "Reversed"] : view === "Bank Accounts" ? ["Active", "Inactive"] : view === "Vendor Payments" ? ["Paid", "Partially paid", "Pending", "Cancelled"] : ["Posted", "Draft", "Review"];
  const setValue = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const saveRecords = (nextValue) => setRecords((current) => {
    const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  const resetForm = () => { setDraft(blank()); setEditingId(""); setFormOpen(false); };

  function openNew() {
    if (!canManageAll) return notify("Only an administrator can manage finance records");
    setDraft(blank()); setEditingId(""); setFormOpen(true);
  }
  function editRecord(record) {
    if (!canManageAll) return notify("Only an administrator can manage finance records");
    setEditingId(record.id);
    setDraft(view === "Receipts"
      ? { customer: record.customer || "", amount: String(record.amount || ""), method: record.method || "Cash", status: record.status || "Received", date: record.date || localDateKey(), reference: record.reference || "", note: record.note || "" }
      : view === "Bank Accounts"
      ? { accountName: record.accountName || "", bankName: record.bankName || "", accountNumber: record.accountNumber || "", openingBalance: String(record.openingBalance || ""), status: record.status || "Active", note: record.note || "" }
        : view === "Vendor Payments"
          ? { vendor: record.vendor || "", invoice: record.invoice || "", dueAmount: String(record.dueAmount || ""), amount: String(record.amount || ""), method: record.method || "Bank", status: record.status || "Paid", date: record.date || localDateKey(), reference: record.reference || "", note: record.note || "" }
        : { date: record.date || localDateKey(), debitAccount: record.debitAccount || "", creditAccount: record.creditAccount || "", amount: String(record.amount || ""), status: record.status || "Posted", reference: record.reference || "", note: record.note || "" });
    setFormOpen(true);
  }
  function saveRecord(event) {
    event.preventDefault();
    const amount = Number(view === "Bank Accounts" ? draft.openingBalance : draft.amount);
    let record;
    if (view === "Receipts") {
      if (!draft.customer.trim() || !Number.isFinite(amount) || amount <= 0) return notify("Enter customer and receipt amount");
      record = { ...draft, id: editingId || `RCT-${Date.now()}`, customer: draft.customer.trim(), amount, reference: draft.reference.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else if (view === "Bank Accounts") {
      if (!draft.accountName.trim() || !draft.bankName.trim()) return notify("Enter account and bank name");
      record = { ...draft, id: editingId || `BANK-${Date.now()}`, accountName: draft.accountName.trim(), bankName: draft.bankName.trim(), accountNumber: draft.accountNumber.trim(), openingBalance: Number.isFinite(amount) ? amount : 0, note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else if (view === "Vendor Payments") {
      const dueAmount = Number(draft.dueAmount);
      if (!draft.vendor.trim() || !Number.isFinite(amount) || amount <= 0) return notify("Enter vendor and payment amount");
      record = { ...draft, id: editingId || `VND-${Date.now()}`, vendor: draft.vendor.trim(), invoice: draft.invoice.trim(), dueAmount: Number.isFinite(dueAmount) ? dueAmount : 0, amount, reference: draft.reference.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else {
      if (!draft.debitAccount.trim() || !draft.creditAccount.trim() || draft.debitAccount.trim() === draft.creditAccount.trim() || !Number.isFinite(amount) || amount <= 0) return notify("Enter different debit and credit accounts with a valid amount");
      record = { ...draft, id: editingId || `JRN-${Date.now()}`, debitAccount: draft.debitAccount.trim(), creditAccount: draft.creditAccount.trim(), amount, reference: draft.reference.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    }
    saveRecords((current) => editingId ? current.map((item) => item.id === editingId ? record : item) : [record, ...current]);
    notify(editingId ? `${singular} updated` : `${singular} saved`);
    resetForm();
  }
  function deleteRecord(record) {
    if (!canManageAll) return notify("Only an administrator can manage finance records");
    if (!window.confirm(`Delete this ${singular.toLowerCase()}?`)) return;
    saveRecords((current) => current.filter((item) => item.id !== record.id));
    notify(`${singular} deleted`);
  }
  function saveLedgerEntry(event) {
    event.preventDefault();
    if (!canManageAll) return notify("Only an administrator can create ledger entries");
    const amount = Number(ledgerDraft.amount);
    const debitAccount = ledgerDraft.debitAccount.trim();
    const creditAccount = ledgerDraft.creditAccount.trim();
    if (!debitAccount || !creditAccount || debitAccount === creditAccount || !Number.isFinite(amount) || amount <= 0) return notify("Enter different debit and credit accounts with a valid amount");
    const record = {
      id: `JRN-${Date.now()}`,
      date: ledgerDraft.date || localDateKey(),
      debitAccount,
      creditAccount,
      amount,
      status: "Posted",
      reference: ledgerDraft.reference.trim() || `LED-${Date.now().toString().slice(-6)}`,
      note: ledgerDraft.note.trim(),
      updatedAt: new Date().toISOString(),
    };
    const journalKey = `vestora-finance-journals-${storeId}`;
    const nextJournals = [record, ...loadStoredArray(journalKey)];
    localStorage.setItem(journalKey, JSON.stringify(nextJournals));
    setReportRecords((current) => ({ ...current, journals: nextJournals }));
    setLedgerDraft({ date: localDateKey(), debitAccount: "", creditAccount: "", amount: "", reference: "", note: "" });
    setLedgerFormOpen(false);
    notify("Ledger entry posted");
  }

  const filtered = records.filter((record) => {
    const text = Object.values(record).join(" ").toLowerCase();
    return (!filters.query || text.includes(filters.query.toLowerCase()))
      && (!["Receipts", "Vendor Payments"].includes(view) || filters.method === "All" || record.method === filters.method)
      && (filters.status === "All" || record.status === filters.status)
      && (view === "Bank Accounts" || !filters.from || record.date >= filters.from)
      && (view === "Bank Accounts" || !filters.to || record.date <= filters.to);
  });
  const receipts = reportRecords.receipts.filter((item) => item.status === "Received");
  const receiptTotal = receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const journalTotal = reportRecords.journals.filter((item) => item.status === "Posted").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const vendorPaymentTotal = reportRecords.vendors.filter((item) => item.status !== "Cancelled").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reportRows = [
    ...reportRecords.receipts.map((item) => ({ date: item.date, type: "Receipt", reference: item.reference || item.id, details: item.customer, method: item.method, amount: Number(item.amount || 0), status: item.status })),
    ...expenses.map((item) => ({ date: item.date, type: "Expense", reference: item.reference || item.id, details: item.category, method: item.paidFrom, amount: -Number(item.amount || 0), status: item.status })),
    ...reportRecords.vendors.map((item) => ({ date: item.date, type: "Vendor payment", reference: item.reference || item.invoice || item.id, details: item.vendor, method: item.method, amount: -Number(item.amount || 0), status: item.status })),
    ...reportRecords.journals.map((item) => ({ date: item.date, type: "Journal", reference: item.reference || item.id, details: `${item.debitAccount} -> ${item.creditAccount}`, method: "Journal", amount: Number(item.amount || 0), status: item.status })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const isLedger = view === "General Ledger";
  const rawLedgerRows = [
    ...reportRecords.banks.filter((item) => item.status === "Active").map((item) => ({ date: item.updatedAt?.slice(0, 10) || localDateKey(), account: item.accountName, debit: Number(item.openingBalance || 0), credit: 0, source: "Opening balance", reference: item.id, details: item.bankName })),
    ...reportRecords.receipts.filter((item) => item.status === "Received").flatMap((item) => [
      { date: item.date, account: item.method || "Cash", debit: Number(item.amount || 0), credit: 0, source: "Receipt", reference: item.reference || item.id, details: item.customer },
      { date: item.date, account: "Sales", debit: 0, credit: Number(item.amount || 0), source: "Receipt", reference: item.reference || item.id, details: item.customer },
    ]),
    ...expenses.filter((item) => item.status === "Posted").flatMap((item) => [
      { date: item.date, account: `Expense - ${item.category}`, debit: Number(item.amount || 0), credit: 0, source: "Expense", reference: item.reference || item.id, details: item.note || item.paidFrom },
      { date: item.date, account: item.paidFrom || "Cash", debit: 0, credit: Number(item.amount || 0), source: "Expense", reference: item.reference || item.id, details: item.category },
    ]),
    ...reportRecords.vendors.filter((item) => item.status !== "Cancelled").flatMap((item) => [
      { date: item.date, account: `Accounts payable - ${item.vendor}`, debit: Number(item.amount || 0), credit: 0, source: "Vendor payment", reference: item.reference || item.invoice || item.id, details: item.invoice || "Vendor settlement" },
      { date: item.date, account: item.method || "Bank", debit: 0, credit: Number(item.amount || 0), source: "Vendor payment", reference: item.reference || item.invoice || item.id, details: item.vendor },
    ]),
    ...reportRecords.journals.filter((item) => item.status === "Posted").flatMap((item) => [
      { date: item.date, account: item.debitAccount, debit: Number(item.amount || 0), credit: 0, source: "Journal", reference: item.reference || item.id, details: item.note || item.creditAccount },
      { date: item.date, account: item.creditAccount, debit: 0, credit: Number(item.amount || 0), source: "Journal", reference: item.reference || item.id, details: item.note || item.debitAccount },
    ]),
  ].filter((item) => item.account);
  const runningBalances = {};
  const ledgerRows = rawLedgerRows.sort((a, b) => `${a.date}-${a.reference}`.localeCompare(`${b.date}-${b.reference}`)).map((item) => {
    const balance = (runningBalances[item.account] || 0) + item.debit - item.credit;
    runningBalances[item.account] = balance;
    return { ...item, balance };
  }).filter((item) => (!filters.query || `${item.account} ${item.reference} ${item.details}`.toLowerCase().includes(filters.query.toLowerCase())) && (!filters.from || item.date >= filters.from) && (!filters.to || item.date <= filters.to));
  const ledgerAccounts = Object.entries(runningBalances).sort(([a], [b]) => a.localeCompare(b));

  if (isLedger) return <section className="screen"><div className="metric-grid compact">
    <Metric icon={BookOpen} label="Ledger accounts" value={ledgerAccounts.length} trend="Accounts with recorded movement" />
    <Metric icon={ReceiptText} label="Total debits" value={formatMoney(ledgerRows.reduce((sum, item) => sum + item.debit, 0))} trend="Selected ledger period" />
    <Metric icon={CreditCard} label="Total credits" value={formatMoney(ledgerRows.reduce((sum, item) => sum + item.credit, 0))} trend="Selected ledger period" />
    <Metric icon={ClipboardList} label="Ledger entries" value={ledgerRows.length} trend="Receipts, expenses, vendor payments, journals" />
  </div><section className="panel finance-workspace"><div className="panel-head finance-head"><div><BookOpen /><h2>General ledger</h2></div><div className="finance-actions"><button onClick={() => { if (!canManageAll) return notify("Only an administrator can create ledger entries"); setLedgerFormOpen(true); }}><Plus size={18} />Create ledger entry</button><button className={filtersOpen ? "active-action" : ""} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} />Filter</button><button className={rangeOpen ? "active-action" : ""} onClick={() => setRangeOpen((open) => !open)}><CalendarClock size={18} />Date range</button><button onClick={() => downloadCsv("vestora-general-ledger.csv", ["Date", "Account", "Source", "Reference", "Details", "Debit", "Credit", "Balance"], ledgerRows.map((item) => ({ Date: item.date, Account: item.account, Source: item.source, Reference: item.reference, Details: item.details, Debit: item.debit, Credit: item.credit, Balance: item.balance })))}><Download size={18} />Export</button></div></div>
    {ledgerFormOpen && <form className="finance-expense-form" onSubmit={saveLedgerEntry}><div className="finance-form-title"><div><span>Manual journal</span><h3>Create balanced ledger entry</h3></div><button type="button" className="icon-action" title="Close ledger entry form" onClick={() => setLedgerFormOpen(false)}><X size={18} /></button></div><label>Date<input type="date" value={ledgerDraft.date} onChange={(event) => setLedgerDraft((current) => ({ ...current, date: event.target.value }))} required /></label><label>Debit account<input placeholder="Example: Cash, Rent expense" value={ledgerDraft.debitAccount} onChange={(event) => setLedgerDraft((current) => ({ ...current, debitAccount: event.target.value }))} required /></label><label>Credit account<input placeholder="Example: Bank, Accounts payable" value={ledgerDraft.creditAccount} onChange={(event) => setLedgerDraft((current) => ({ ...current, creditAccount: event.target.value }))} required /></label><label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={ledgerDraft.amount} onChange={(event) => setLedgerDraft((current) => ({ ...current, amount: event.target.value }))} required /></label><label>Reference<input placeholder="Optional reference" value={ledgerDraft.reference} onChange={(event) => setLedgerDraft((current) => ({ ...current, reference: event.target.value }))} /></label><label className="finance-note">Details<input placeholder="Optional description" value={ledgerDraft.note} onChange={(event) => setLedgerDraft((current) => ({ ...current, note: event.target.value }))} /></label><div className="finance-form-actions"><button type="button" onClick={() => setLedgerFormOpen(false)}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />Post entry</button></div></form>}
    {(filtersOpen || rangeOpen) && <div className="finance-filter-row">{filtersOpen && <label className="finance-search"><Search size={18} /><input placeholder="Search account, reference, or details" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>}{rangeOpen && <><label>Start date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>End date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label></>}<button className="text-action" onClick={() => setFilters({ query: "", method: "All", status: "All", from: "", to: "" })}>Clear filters</button></div>}
  <div className="finance-summary"><span>Double-entry view of recorded finance activity</span><span><strong>{ledgerAccounts.length}</strong> account balances in view</span></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Account</th><th>Source</th><th>Reference</th><th>Details</th><th>Debit</th><th>Credit</th><th>Running balance</th></tr></thead><tbody>{ledgerRows.length ? ledgerRows.map((item, index) => <tr key={`${item.account}-${item.reference}-${index}`}><td>{item.date || "-"}</td><td><strong>{item.account}</strong></td><td>{item.source}</td><td>{item.reference}</td><td>{item.details || "-"}</td><td>{item.debit ? formatMoney(item.debit) : "-"}</td><td>{item.credit ? formatMoney(item.credit) : "-"}</td><td><strong>{formatMoney(item.balance)}</strong></td></tr>) : <tr><td colSpan="8" className="finance-empty">No ledger entries match this period. Create a ledger entry or record receipts, expenses, vendor payments, or journals.</td></tr>}</tbody></table></div><div className="finance-summary ledger-account-summary">{ledgerAccounts.map(([account, balance]) => <span key={account}>{account} <strong>{formatMoney(balance)}</strong></span>)}</div></section></section>;

  if (isReports) return <section className="screen"><div className="metric-grid compact">
    <Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(netSales)} trend="POS sales after refunds" />
    <Metric icon={ReceiptText} label="Recorded receipts" value={formatMoney(receiptTotal)} trend={`${receipts.length} received records`} />
    <Metric icon={DatabaseZap} label="Expenses" value={formatMoney(expenseTotal)} trend={`${expenses.length} expense records`} />
    <Metric icon={ClipboardList} label="Journal value" value={formatMoney(journalTotal)} trend={`${reportRecords.journals.length} journal entries`} />
    <Metric icon={BadgeIndianRupee} label="Vendor paid" value={formatMoney(vendorPaymentTotal)} trend={`${reportRecords.vendors.length} vendor payments`} />
  </div><section className="panel finance-workspace"><div className="panel-head finance-head"><div><FileBarChart /><h2>Finance reports</h2></div><button onClick={() => downloadCsv("vestora-finance-report.csv", ["Date", "Type", "Reference", "Details", "Method", "Amount", "Status"], reportRows.map((item) => ({ Date: item.date, Type: item.type, Reference: item.reference, Details: item.details, Method: item.method, Amount: item.amount, Status: item.status })))}><Download size={18} />Export</button></div><div className="finance-summary"><span>Cash collected <strong>{formatMoney(cashCollected)}</strong></span><span>Receivables <strong>{formatMoney(receivables)}</strong></span><span>Bank accounts <strong>{reportRecords.banks.length}</strong></span><span>Net GST <strong>{formatMoney(netGst)}</strong></span></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Details</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{reportRows.length ? reportRows.map((item, index) => <tr key={`${item.type}-${item.reference}-${index}`}><td>{item.date || "-"}</td><td>{item.type}</td><td>{item.reference}</td><td>{item.details}</td><td>{item.method}</td><td>{formatMoney(item.amount)}</td><td><span className={`status-pill ${String(item.status).toLowerCase()}`}>{item.status}</span></td></tr>) : <tr><td colSpan="7" className="finance-empty">No finance activity recorded yet.</td></tr>}</tbody></table></div></section></section>;

  return <section className="screen"><div className="metric-grid compact"><Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(netSales)} trend="POS sales after refunds" /><Metric icon={CreditCard} label="Cash collected" value={formatMoney(cashCollected)} trend="POS cash payments" /><Metric icon={DatabaseZap} label="Expenses" value={formatMoney(expenseTotal)} trend={`${expenses.length} expense records`} /><Metric icon={ReceiptText} label="Receivables" value={formatMoney(receivables)} trend="Credit due" /></div><section className="panel finance-workspace"><div className="panel-head finance-head"><div>{view === "Receipts" ? <ReceiptText /> : view === "Bank Accounts" ? <CreditCard /> : view === "Vendor Payments" ? <BadgeIndianRupee /> : <ClipboardList />}<h2>{title}</h2></div><div className="finance-actions"><button onClick={openNew}><Plus size={18} />{view === "Receipts" ? "Record receipt" : view === "Bank Accounts" ? "Add bank account" : view === "Vendor Payments" ? "Record vendor payment" : "Record journal"}</button><button className={filtersOpen ? "active-action" : ""} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} />Filter</button>{view !== "Bank Accounts" && <button className={rangeOpen ? "active-action" : ""} onClick={() => setRangeOpen((open) => !open)}><CalendarClock size={18} />Date range</button>}<button onClick={() => downloadCsv(`vestora-${view.toLowerCase().replaceAll(" ", "-")}.csv`, Object.keys(filtered[0] || {}), filtered)}><Download size={18} />Export</button></div></div>
    {(filtersOpen || rangeOpen) && <div className="finance-filter-row">{filtersOpen && <><label className="finance-search"><Search size={18} /><input placeholder={`Search ${title.toLowerCase()}`} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>{["Receipts", "Vendor Payments"].includes(view) && <label>Method<select value={filters.method} onChange={(event) => setFilters((current) => ({ ...current, method: event.target.value }))}><option>All</option><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option><option>Wallet</option></select></label>}<label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></>}{rangeOpen && <><label>Start date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>End date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label></>}<button className="text-action" onClick={() => setFilters({ query: "", method: "All", status: "All", from: "", to: "" })}>Clear filters</button></div>}
    {formOpen && <form className="finance-expense-form" onSubmit={saveRecord}><div className="finance-form-title"><div><span>{editingId ? `Update ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}</span><strong>{title}</strong></div><button type="button" className="icon-button" title="Close form" onClick={resetForm}><X size={18} /></button></div>{view === "Receipts" && <><label>Customer<input autoFocus placeholder="Customer name" value={draft.customer} onChange={(event) => setValue("customer", event.target.value)} /></label><label>Amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setValue("amount", event.target.value)} /></label><label>Payment method<select value={draft.method} onChange={(event) => setValue("method", event.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option><option>Wallet</option></select></label><label>Date<input type="date" value={draft.date} onChange={(event) => setValue("date", event.target.value)} /></label></>}{view === "Bank Accounts" && <><label>Account name<input autoFocus placeholder="Current account" value={draft.accountName} onChange={(event) => setValue("accountName", event.target.value)} /></label><label>Bank name<input placeholder="Bank name" value={draft.bankName} onChange={(event) => setValue("bankName", event.target.value)} /></label><label>Account number<input placeholder="Last four digits or account number" value={draft.accountNumber} onChange={(event) => setValue("accountNumber", event.target.value)} /></label><label>Opening balance<input type="number" step="0.01" value={draft.openingBalance} onChange={(event) => setValue("openingBalance", event.target.value)} /></label></>}{view === "Vendor Payments" && <><label>Vendor<input autoFocus placeholder="Supplier or vendor name" value={draft.vendor} onChange={(event) => setValue("vendor", event.target.value)} /></label><label>Invoice no.<input placeholder="Supplier invoice number" value={draft.invoice} onChange={(event) => setValue("invoice", event.target.value)} /></label><label>Due amount<input type="number" min="0" step="0.01" value={draft.dueAmount} onChange={(event) => setValue("dueAmount", event.target.value)} /></label><label>Paid amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setValue("amount", event.target.value)} /></label><label>Payment method<select value={draft.method} onChange={(event) => setValue("method", event.target.value)}><option>Bank</option><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select></label><label>Date<input type="date" value={draft.date} onChange={(event) => setValue("date", event.target.value)} /></label></>}{view === "Journal Entries" && <><label>Date<input type="date" value={draft.date} onChange={(event) => setValue("date", event.target.value)} /></label><label>Debit account<input autoFocus placeholder="Cash, bank, expense" value={draft.debitAccount} onChange={(event) => setValue("debitAccount", event.target.value)} /></label><label>Credit account<input placeholder="Sales, payable, bank" value={draft.creditAccount} onChange={(event) => setValue("creditAccount", event.target.value)} /></label><label>Amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setValue("amount", event.target.value)} /></label></>}<label>Status<select value={draft.status} onChange={(event) => setValue("status", event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Reference<input placeholder="Invoice, voucher, or receipt number" value={draft.reference || ""} onChange={(event) => setValue("reference", event.target.value)} /></label><label className="finance-note">Notes<input placeholder="Optional note" value={draft.note} onChange={(event) => setValue("note", event.target.value)} /></label><div className="finance-form-actions"><button type="button" onClick={resetForm}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />{editingId ? "Save changes" : `Save ${singular.toLowerCase()}`}</button></div></form>}
    <div className="finance-summary"><span>Showing <strong>{filtered.length}</strong> records</span><span>{view === "Receipts" ? "Received" : view === "Bank Accounts" ? "Opening balance" : view === "Vendor Payments" ? "Paid to vendors" : "Posted value"} <strong>{formatMoney(filtered.reduce((sum, item) => sum + Number(item.amount ?? item.openingBalance ?? 0), 0))}</strong></span></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr>{view === "Receipts" ? <><th>Date</th><th>Customer</th><th>Receipt no.</th><th>Method</th><th>Amount</th></> : view === "Bank Accounts" ? <><th>Account</th><th>Bank</th><th>Account number</th><th>Opening balance</th></> : view === "Vendor Payments" ? <><th>Date</th><th>Vendor</th><th>Invoice no.</th><th>Due</th><th>Paid</th><th>Balance</th><th>Method</th></> : <><th>Date</th><th>Entry no.</th><th>Debit account</th><th>Credit account</th><th>Amount</th></>}<th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.length ? filtered.map((record) => <tr key={record.id}>{view === "Receipts" ? <><td>{record.date}</td><td><strong>{record.customer}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.reference || record.id}</td><td>{record.method}</td><td>{formatMoney(record.amount)}</td></> : view === "Bank Accounts" ? <><td><strong>{record.accountName}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.bankName}</td><td>{record.accountNumber || "-"}</td><td>{formatMoney(record.openingBalance)}</td></> : view === "Vendor Payments" ? <><td>{record.date}</td><td><strong>{record.vendor}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.invoice || record.reference || "-"}</td><td>{formatMoney(record.dueAmount)}</td><td>{formatMoney(record.amount)}</td><td>{formatMoney(Math.max(0, Number(record.dueAmount || 0) - Number(record.amount || 0)))}</td><td>{record.method}</td></> : <><td>{record.date}</td><td>{record.reference || record.id}</td><td>{record.debitAccount}</td><td>{record.creditAccount}</td><td>{formatMoney(record.amount)}</td></>}<td><span className={`status-pill ${String(record.status).toLowerCase()}`}>{record.status}</span></td><td><div className="row-actions"><button title={`Edit ${singular.toLowerCase()}`} onClick={() => editRecord(record)}><Pencil size={17} />Edit</button><button className="danger-action" title={`Delete ${singular.toLowerCase()}`} onClick={() => deleteRecord(record)}><Trash2 size={17} />Delete</button></div></td></tr>) : <tr><td colSpan={view === "Vendor Payments" ? 9 : 7} className="finance-empty">No {title.toLowerCase()} records match this view.</td></tr>}</tbody></table></div></section></section>;
}

function BillTemplateEditor({ billTemplate, setBillTemplate, notify }) {
  const displayToggles = [
    ["showLogo", "Logo"],
    ["showAddress", "Address"],
    ["showPhone", "Phone"],
    ["showEmail", "Email"],
    ["showGst", "GST"],
    ["showFssai", "FSSAI"],
    ["showCustomer", "Customer fields"],
    ["showOrderInfo", "Order info"],
    ["showPayment", "Payment"],
    ["showTaxBreakup", "Tax breakup"],
    ["showItemCount", "Item count"],
    ["showQrBox", "QR box"],
    ["showTerms", "Terms"],
  ];

  function update(field, value) {
    setBillTemplate((current) => ({ ...current, [field]: value }));
  }

  const billFontSize = getBillFontSize(billTemplate.fontSize);
  const billPreviewClass = `bill-paper print-bill bill-layout-${String(billTemplate.layout || "Detailed").toLowerCase()}`;
  const billPreviewStyle = getBillPaperStyle({ ...billTemplate, fontSize: billFontSize });

  function updateBillFontSize(value) {
    update("fontSize", getBillFontSize(value));
  }

  function saveBillFormat() {
    const normalizedTemplate = { ...defaultBillTemplate, ...billTemplate, fontSize: billFontSize };
    localStorage.setItem("vestora-bill-template", JSON.stringify(normalizedTemplate));
    setBillTemplate(normalizedTemplate);
    notify("Bill format saved");
  }

  function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Upload an image file for logo");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update("logoData", reader.result);
      update("showLogo", true);
      notify("Logo uploaded");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <div className="bill-editor">
      <div className="bill-editor-head">
        <div>
          <span>Advanced bill designer</span>
          <h3>Customize printed receipt</h3>
          <p>Control receipt branding, paper layout, visible sections, footer notes, and print preview.</p>
        </div>
        <button type="button" className="bill-save-format" onClick={saveBillFormat}><Save size={17} />Save format</button>
      </div>

      <div className="bill-editor-layout">
        <div className="bill-editor-controls">
          <section className="bill-editor-card">
            <div className="bill-editor-card-head"><strong>Branding</strong><span>Logo and restaurant identity</span></div>
            <div className="logo-upload-row">
              <div className="logo-preview">{billTemplate.showLogo && <img src={billTemplate.logoData || vestoraLogoPath} alt="" />}</div>
              <div>
                <strong>Bill logo</strong>
                <span>Upload restaurant logo for printed bills.</span>
                <label className="file-upload">Upload logo<input type="file" accept="image/*" onChange={uploadLogo} /></label>
              </div>
            </div>
            <div className="bill-editor-grid">
              <label>Bill title<input value={billTemplate.billTitle || ""} onChange={(event) => update("billTitle", event.target.value)} /></label>
              <label>Restaurant name<input value={billTemplate.restaurantName} onChange={(event) => update("restaurantName", event.target.value)} /></label>
              <label className="wide">Tagline<input value={billTemplate.tagline || ""} onChange={(event) => update("tagline", event.target.value)} /></label>
              <label className="wide">Address<input value={billTemplate.address} onChange={(event) => update("address", event.target.value)} /></label>
              <label>Phone<input value={billTemplate.phone || ""} onChange={(event) => update("phone", event.target.value)} /></label>
              <label>Email<input value={billTemplate.email || ""} onChange={(event) => update("email", event.target.value)} /></label>
              <label>GST number<input value={billTemplate.gst} onChange={(event) => update("gst", event.target.value)} /></label>
              <label>FSSAI number<input value={billTemplate.fssai} onChange={(event) => update("fssai", event.target.value)} /></label>
            </div>
          </section>

          <section className="bill-editor-card">
            <div className="bill-editor-card-head"><strong>Paper and layout</strong><span>Thermal receipt structure</span></div>
            <div className="bill-editor-grid compact">
              <label>Paper size<select value={billTemplate.printerSize} onChange={(event) => update("printerSize", event.target.value)}><option>80mm</option><option>58mm</option></select></label>
              <label>Layout<select value={billTemplate.layout || "Detailed"} onChange={(event) => update("layout", event.target.value)}><option>Detailed</option><option>Compact</option><option>Branded</option></select></label>
              <label>Logo position<select value={billTemplate.logoPosition || "Left"} onChange={(event) => update("logoPosition", event.target.value)}><option>Left</option><option>Center</option></select></label>
              <div className="bill-font-control">
                <span>Font size</span>
                <div className="number-stepper">
                  <button type="button" onClick={() => updateBillFontSize(billFontSize - 1)} aria-label="Decrease bill font size"><Minus size={15} /></button>
                  <input type="number" min="10" max="22" step="1" value={billFontSize} onChange={(event) => updateBillFontSize(event.target.value)} aria-label="Bill font size in pixels" />
                  <strong>px</strong>
                  <button type="button" onClick={() => updateBillFontSize(billFontSize + 1)} aria-label="Increase bill font size"><Plus size={15} /></button>
                </div>
                <input className="bill-font-range" type="range" min="10" max="22" step="1" value={billFontSize} onChange={(event) => updateBillFontSize(event.target.value)} aria-label="Bill font size slider" />
              </div>
            </div>
          </section>

          <section className="bill-editor-card">
            <div className="bill-editor-card-head"><strong>Visible sections</strong><span>Choose what appears on the printed bill</span></div>
            <div className="bill-toggle-grid">
              {displayToggles.map(([field, label]) => (
                <button key={field} className={billTemplate[field] !== false ? "active" : ""} onClick={() => update(field, billTemplate[field] === false)}>
                  {billTemplate[field] !== false ? <CircleCheck size={15} /> : <X size={15} />}
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="bill-editor-card">
            <div className="bill-editor-card-head"><strong>Footer and QR</strong><span>Closing copy and optional QR placeholder</span></div>
            <div className="bill-editor-grid">
              <label className="wide">Footer message<input value={billTemplate.footer} onChange={(event) => update("footer", event.target.value)} /></label>
              <label className="wide">Terms / policy<input value={billTemplate.terms || ""} onChange={(event) => update("terms", event.target.value)} /></label>
              <label>QR label<input value={billTemplate.qrText || ""} onChange={(event) => update("qrText", event.target.value)} /></label>
              <label>Copy label<input value={billTemplate.copyLabel || ""} onChange={(event) => update("copyLabel", event.target.value)} /></label>
            </div>
          </section>

          <div className="editor-row">
            <button className={billTemplate.showLogo ? "active-action" : ""} onClick={() => update("showLogo", !billTemplate.showLogo)}>{billTemplate.showLogo ? "Logo on" : "Logo off"}</button>
            <button onClick={() => { update("logoData", ""); notify("Logo reset to default"); }}>Reset logo</button>
            <button onClick={() => setBillTemplate(defaultBillTemplate)}>Reset all</button>
          </div>
        </div>

        <div className="bill-editor-preview">
          <div className={billPreviewClass} style={billPreviewStyle}>
            <BillReceiptHeader billTemplate={billTemplate} />
            {billTemplate.showOrderInfo !== false && <div className="bill-type-row"><span>Billing type</span><strong>Dine-in</strong></div>}
            <BillReceiptMeta billTemplate={billTemplate} rows={[
              ["Order number", "ORD-1024"],
              ["Date & time", "04 Aug, 05:12 pm"],
              billTemplate.showPayment !== false && ["Payment", "UPI"],
              billTemplate.showCustomer !== false && ["Customer name", "Sample customer"],
            ]} />
            <div className="bill-items">
              <div className="bill-line"><span>2 x Paneer Tikka Bowl</span><strong>{formatMoney(498)}</strong></div>
              <div className="bill-line"><span>1 x Filter Coffee</span><strong>{formatMoney(99)}</strong></div>
            </div>
            <div className="totals"><span>Subtotal <strong>{formatMoney(597)}</strong></span><span>Discount <strong>{formatMoney(0)}</strong></span>{billTemplate.showTaxBreakup !== false && <span>CGST <strong>{formatMoney(15)}</strong></span>}{billTemplate.showTaxBreakup !== false && <span>SGST <strong>{formatMoney(15)}</strong></span>}{billTemplate.showItemCount && <span>Items <strong>3</strong></span>}<b>Grand total <strong>{formatMoney(627)}</strong></b><BillReceiptFooter billTemplate={billTemplate} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Reports({ notify, storeId, salesLedger, voidLedger, refundLedger, onRefund, lastShiftClose, comparisonStores = [], comparisonSalesLedger = [], activeView = "Daily sales", onReportChange }) {
  const [selectedReport, setSelectedReport] = useState(activeView);
  const [range, setRange] = useState("Today");
  const [reportSearch, setReportSearch] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportFilter, setReportFilter] = useState("All");
  const [refundDraft, setRefundDraft] = useState({ billId: "", amount: "", payment: "Cash", reason: "" });
  const reportInventory = stripUntouchedDefaultRecords(loadStoredArray(`vestora-inventory-${storeId}`), defaultInventoryItems, ["updatedAt"]);
  const reportRecipes = stripUntouchedDefaultRecords(loadStoredArray(`vestora-recipes-${storeId}`), defaultRecipes, ["changedAt", "changedBy"]);

  useEffect(() => {
    if (reports.includes(activeView)) setSelectedReport(activeView);
  }, [activeView]);

  useEffect(() => {
    setReportFilter("All");
  }, [selectedReport]);

  function selectReport(name, message = true) {
    setSelectedReport(name);
    onReportChange?.(name);
    if (message) notify(`${name} workbook opened`);
  }
  const rangeLedger = salesLedger.filter((bill) => reportDate ? isOnReportDate(bill.createdAt, reportDate) : isInReportRange(bill.createdAt, range));
  const todayLedger = salesLedger.filter((bill) => isTodayDate(bill.createdAt));
  const ledgerSales = rangeLedger.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const ledgerTax = rangeLedger.reduce((sum, bill) => sum + Number(bill.tax || 0), 0);
  const ledgerDiscount = rangeLedger.reduce((sum, bill) => sum + Number(bill.discount || 0), 0);
  const ledgerOrders = rangeLedger.length;
  const todaySales = todayLedger.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const todayOrders = todayLedger.length;
  const averageBill = ledgerOrders ? Math.round(ledgerSales / ledgerOrders) : 0;
  const sevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { key: localDateKey(date), day: date.toLocaleDateString("en-US", { weekday: "short" }) };
  });
  const dailyGroups = groupBills(salesLedger, (bill) => localDateKey(bill.createdAt));
  const reportGraph = sevenDays.map((day) => ({ ...day, sales: dailyGroups[day.key]?.sales || 0, orders: dailyGroups[day.key]?.orders || 0 }));
  const paymentGroups = groupBills(rangeLedger, (bill) => bill.payment);
  const orderGroups = groupBills(rangeLedger, (bill) => bill.orderType);
  const hourGroups = groupBills(rangeLedger, (bill) => {
    const date = new Date(bill.createdAt);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return `${String(date.getHours()).padStart(2, "0")}:00`;
  });
  const dailySummaries = Object.entries(groupBills(rangeLedger, (bill) => localDateKey(bill.createdAt)))
    .sort(([a], [b]) => b.localeCompare(a));
  const dateRows = dailySummaries
    .map(([date, summary]) => [reportDateLabel(date), summary.orders, formatMoney(summary.sales), formatMoney(summary.tax), formatMoney(summary.discount)]);
  const dailySaleRows = rangeLedger.map((bill) => [
    bill.id,
    formatDateTime(bill.createdAt),
    bill.orderType,
    bill.itemCount || 0,
    bill.payment,
    formatMoney(Number(bill.tax || 0)),
    formatMoney(Number(bill.discount || 0)),
    formatMoney(Number(bill.total || 0)),
  ]);
  const paymentRows = Object.entries(paymentGroups).map(([payment, summary]) => [payment, summary.orders, formatMoney(summary.sales), formatMoney(summary.tax)]);
  const orderRows = Object.entries(orderGroups).map(([type, summary]) => [type, summary.orders, summary.items, formatMoney(summary.sales)]);
  const hourlyRows = Object.entries(hourGroups).sort(([a], [b]) => a.localeCompare(b)).map(([hour, summary]) => [hour, summary.orders, formatMoney(summary.sales)]);
  const itemRows = rangeLedger.flatMap((bill) => (bill.items || []).map((item) => [
    reportDateLabel(localDateKey(bill.createdAt)),
    bill.id,
    bill.orderType,
    item.name,
    item.qty,
    formatMoney(Number(item.price || 0)),
    formatMoney(Number(item.price || 0) * Number(item.qty || 0)),
  ])).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const inventoryValuationRows = reportInventory.map((item) => {
    const stock = Number(item.stock || 0);
    const unitCost = Number(item.cost || 0);
    return [
      item.name,
      item.sku || "-",
      stock.toLocaleString("en-IN", { maximumFractionDigits: 3 }),
      item.unit,
      formatPreciseMoney(unitCost),
      formatPreciseMoney(stock * unitCost),
    ];
  }).sort((first, second) => String(first[0]).localeCompare(String(second[0])));
  const recipeSalesRows = rangeLedger.flatMap((bill) => (bill.items || []).map((item) => {
    const recipe = reportRecipes.find((entry) => String(entry.name || "").trim().toLowerCase() === String(item.name || "").trim().toLowerCase());
    const quantity = Number(item.qty || 0);
    const sales = Number(item.price || 0) * quantity;
    const costDetails = recipe ? getRecipeCostDetails(recipe, reportInventory) : null;
    const recipeCost = costDetails && !costDetails.missingIngredients.length ? costDetails.cost : null;
    const foodCost = recipeCost === null ? null : recipeCost * quantity;
    const grossProfit = foodCost === null ? null : sales - foodCost;
    const margin = grossProfit === null || sales <= 0 ? null : (grossProfit / sales) * 100;
    return {
      date: reportDateLabel(localDateKey(bill.createdAt)),
      item: item.name,
      quantity,
      sales,
      recipeCost,
      foodCost,
      grossProfit,
      margin,
      status: !recipe ? "Recipe not linked" : costDetails.missingIngredients.length ? `Missing cost: ${costDetails.missingIngredients.join(", ")}` : "Costed",
    };
  })).sort((first, second) => String(second.date).localeCompare(String(first.date)) || String(first.item).localeCompare(String(second.item)));
  const foodCostRows = recipeSalesRows.map((row) => [
    row.date,
    row.item,
    row.quantity,
    row.recipeCost === null ? row.status : formatPreciseMoney(row.recipeCost),
    row.foodCost === null ? "-" : formatPreciseMoney(row.foodCost),
  ]);
  const menuProfitRows = recipeSalesRows.map((row) => [
    row.date,
    row.item,
    row.quantity,
    formatPreciseMoney(row.sales),
    row.foodCost === null ? row.status : formatPreciseMoney(row.foodCost),
    row.grossProfit === null ? "-" : formatPreciseMoney(row.grossProfit),
    row.margin === null ? "-" : `${row.margin.toFixed(1)}%`,
  ]);
  const latestRows = rangeLedger.slice(0, 10).map((bill) => [bill.id, reportDateLabel(localDateKey(bill.createdAt)), bill.orderType, bill.payment, formatMoney(bill.total || 0)]);
  const closeVariance = Number(lastShiftClose?.variance || 0);
  const rangeVoids = voidLedger.filter((entry) => reportDate ? isOnReportDate(entry.createdAt, reportDate) : isInReportRange(entry.createdAt, range));
  const rangeRefunds = refundLedger.filter((entry) => reportDate ? isOnReportDate(entry.createdAt, reportDate) : isInReportRange(entry.createdAt, range));
  const refundTotal = rangeRefunds.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const refundTax = rangeRefunds.reduce((sum, entry) => {
    if (Number.isFinite(Number(entry.taxAmount))) return sum + Number(entry.taxAmount);
    const bill = salesLedger.find((sale) => sale.id === entry.billId || sale.orderNumber === entry.billId);
    return sum + (bill?.total ? Number(bill.tax || 0) * (Number(entry.amount || 0) / Number(bill.total)) : 0);
  }, 0);
  const netRangeSales = ledgerSales - refundTotal;
  const netRangeTax = Math.max(ledgerTax - refundTax, 0);
  const todayRefundTotal = refundLedger.filter((entry) => isTodayDate(entry.createdAt)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const netTodaySales = todaySales - todayRefundTotal;
  const gstSummaryByDate = new Map(dailySummaries.map(([date, summary]) => [date, {
    orders: summary.orders,
    sales: Number(summary.sales || 0),
    tax: Number(summary.tax || 0),
    refunds: 0,
    refundTax: 0,
  }]));
  rangeRefunds.forEach((entry) => {
    const date = localDateKey(entry.createdAt);
    const current = gstSummaryByDate.get(date) || { orders: 0, sales: 0, tax: 0, refunds: 0, refundTax: 0 };
    const linkedBill = salesLedger.find((sale) => sale.id === entry.billId || sale.orderNumber === entry.billId);
    const taxAmount = Number.isFinite(Number(entry.taxAmount))
      ? Number(entry.taxAmount)
      : linkedBill?.total ? Number(linkedBill.tax || 0) * (Number(entry.amount || 0) / Number(linkedBill.total)) : 0;
    gstSummaryByDate.set(date, { ...current, refunds: current.refunds + Number(entry.amount || 0), refundTax: current.refundTax + taxAmount });
  });
  const gstRows = Array.from(gstSummaryByDate.entries()).sort(([first], [second]) => String(second).localeCompare(String(first))).map(([date, summary]) => [
    reportDateLabel(date),
    summary.orders,
    formatMoney((summary.sales - summary.tax) - (summary.refunds - summary.refundTax)),
    formatMoney(summary.tax - summary.refundTax),
    formatMoney(summary.sales - summary.refunds),
  ]);
  const comparisonRangeLedger = comparisonSalesLedger.filter((bill) => reportDate ? isOnReportDate(bill.createdAt, reportDate) : isInReportRange(bill.createdAt, range));
  const branchComparisonRows = comparisonStores.map((store) => {
    const branchBills = comparisonRangeLedger.filter((bill) => normalizeStoreId(bill.storeId) === store.id);
    const branchSales = branchBills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
    return [store.branch || store.name, branchBills.length, formatMoney(branchSales)];
  });
  const voidRows = rangeVoids.map((entry) => [
    entry.category === "Table order" ? "Cancelled order" : entry.status?.startsWith("Table item cancelled") ? "Cancelled item" : "Void item",
    entry.id,
    formatDateTime(entry.createdAt),
    entry.itemName,
    entry.qty,
    entry.orderType,
    formatMoney(Number(entry.amount || 0)),
    entry.reason || entry.status,
  ]);
  const refundRows = rangeRefunds.map((entry) => [
    "Refund",
    entry.id,
    formatDateTime(entry.createdAt),
    entry.billId,
    "-",
    entry.payment,
    formatMoney(Number(entry.amount || 0)),
    entry.reason,
  ]);
  const voidRefundRows = [...refundRows, ...voidRows];
  const shiftCloseRows = lastShiftClose ? [[
    formatDateTime(lastShiftClose.closedAt),
    formatMoney(Number(lastShiftClose.openingBalance || 0)),
    formatMoney(Number(lastShiftClose.cashSales || 0)),
    formatMoney(Number(lastShiftClose.expectedClosingCash || 0)),
    formatMoney(Number(lastShiftClose.closingBalance || 0)),
    closeVariance === 0 ? "Tallied" : `${closeVariance > 0 ? "Excess" : "Short"} ${formatMoney(Math.abs(closeVariance))}`,
    lastShiftClose.varianceNote || "No variance note",
  ]] : [["No shift close saved yet", "", "", "", "", "", ""]];
  const reportTables = {
    "Daily sales": { columns: ["Bill", "Date and time", "Billing type", "Qty", "Payment", "GST", "Discount", "Total"], rows: dailySaleRows.length ? dailySaleRows : [["No POS sales found for this range", "", "", "", "", "", "", ""]] },
    "Hourly sales": { columns: ["Hour", "Bills", "Sales"], rows: hourlyRows },
    GST: { columns: ["Date", "Bills", "Taxable value", "GST", "Total"], rows: gstRows },
    "Item-wise sales": { columns: ["Date", "Bill", "Billing type", "Item", "Qty sold", "Rate", "Sales"], rows: itemRows.length ? itemRows : [["No item sales found for this range", "", "", "", "", "", ""]] },
    "Inventory valuation": { columns: ["Item", "SKU", "Stock", "Unit", "Unit cost", "Stock value"], rows: inventoryValuationRows.length ? inventoryValuationRows : [["No inventory items found", "", "", "", "", ""]] },
    "Food cost analysis": { columns: ["Date", "Item", "Qty sold", "Recipe cost / unit", "Total food cost"], rows: foodCostRows.length ? foodCostRows : [["No POS sales found for this range", "", "", "", ""]] },
    "Menu profitability": { columns: ["Date", "Item", "Qty sold", "Net sales", "Food cost", "Gross profit", "Margin"], rows: menuProfitRows.length ? menuProfitRows : [["No POS sales found for this range", "", "", "", "", "", ""]] },
    Payroll: { columns: ["Period", "Bills handled", "Service sales"], rows: [["Current range", ledgerOrders, formatMoney(ledgerSales)]] },
    "Cashier closing": { columns: ["Closed at", "Opening", "Cash sales", "Expected", "Closed amount", "Variance", "Note"], rows: shiftCloseRows },
    "Void and refund": { columns: ["Type", "ID", "Time", "Bill / item", "Qty", "Payment / billing", "Amount", "Reason"], rows: voidRefundRows.length ? voidRefundRows : [["No void or refund entries", "", "", "", "", "", "", ""]] },
    "Branch comparison": { columns: ["Branch", "Bills", "Sales"], rows: branchComparisonRows.length ? branchComparisonRows : [["No active branches", 0, formatMoney(0)]] },
    "Supplier outstanding": { columns: ["Supplier", "Invoices", "Outstanding"], rows: [["Fresh Farm Supplies", 2, formatMoney(18400)], ["Daily Dairy Co.", 1, formatMoney(6200)]] },
  };
  const activeTable = reportTables[selectedReport] || reportTables["Daily sales"];
  const reportFilterConfig = {
    "Daily sales": { label: "Payment", column: 4 },
    "Hourly sales": { label: "Hour", column: 0 },
    GST: { label: "Report date", column: 0 },
    "Item-wise sales": { label: "Item", column: 3 },
    "Inventory valuation": { label: "Item", column: 0 },
    "Food cost analysis": { label: "Item", column: 1 },
    "Menu profitability": { label: "Item", column: 1 },
    Payroll: { label: "Period", column: 0 },
    "Cashier closing": { label: "Closing status", column: 5 },
    "Void and refund": { label: "Entry type", column: 0 },
    "Branch comparison": { label: "Branch", column: 0 },
    "Supplier outstanding": { label: "Supplier", column: 0 },
  };
  const currentFilter = reportFilterConfig[selectedReport] || { label: "Filter", column: 0 };
  const reportFilterOptions = Array.from(new Set(activeTable.rows.map((row) => String(row[currentFilter.column] ?? "")).filter(Boolean))).sort((first, second) => first.localeCompare(second));
  const filteredReportRows = activeTable.rows
    .filter((row) => reportFilter === "All" || String(row[currentFilter.column] ?? "") === reportFilter)
    .filter((row) => row.join(" ").toLowerCase().includes(reportSearch.toLowerCase()));
  const emptyReportRow = activeTable.columns.map((_, index) => (index === 0 ? "No POS sales found for this range" : ""));
  const visibleReportRows = filteredReportRows.length ? filteredReportRows : [emptyReportRow];
  const displayAmountToNumber = (value) => {
    const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
    return Number.isFinite(Number(normalized)) ? Number(normalized) : 0;
  };
  const sumVisibleColumn = (column) => filteredReportRows.reduce((sum, row) => sum + displayAmountToNumber(row[column]), 0);
  const reportColumnTotals = {
    "Daily sales": { 0: "TOTAL", 5: formatMoney(sumVisibleColumn(5)), 6: formatMoney(sumVisibleColumn(6)), 7: formatMoney(sumVisibleColumn(7)) },
    "Hourly sales": { 0: "TOTAL", 1: sumVisibleColumn(1), 2: formatMoney(sumVisibleColumn(2)) },
    GST: { 0: "TOTAL", 1: sumVisibleColumn(1), 2: formatMoney(sumVisibleColumn(2)), 3: formatMoney(sumVisibleColumn(3)), 4: formatMoney(sumVisibleColumn(4)) },
    "Item-wise sales": { 3: "TOTAL", 4: sumVisibleColumn(4), 6: formatMoney(sumVisibleColumn(6)) },
    "Inventory valuation": { 0: "TOTAL", 5: formatPreciseMoney(sumVisibleColumn(5)) },
    "Food cost analysis": { 1: "TOTAL", 2: sumVisibleColumn(2), 4: formatPreciseMoney(sumVisibleColumn(4)) },
    "Menu profitability": { 1: "TOTAL", 3: formatPreciseMoney(sumVisibleColumn(3)), 4: formatPreciseMoney(sumVisibleColumn(4)), 5: formatPreciseMoney(sumVisibleColumn(5)) },
    Payroll: { 0: "TOTAL", 1: sumVisibleColumn(1), 2: formatMoney(sumVisibleColumn(2)) },
    "Cashier closing": { 0: "TOTAL", 3: formatMoney(sumVisibleColumn(3)), 4: formatMoney(sumVisibleColumn(4)) },
    "Void and refund": { 0: "TOTAL", 6: formatMoney(sumVisibleColumn(6)) },
    "Branch comparison": { 0: "TOTAL", 1: sumVisibleColumn(1), 2: formatMoney(sumVisibleColumn(2)) },
    "Supplier outstanding": { 0: "TOTAL", 1: sumVisibleColumn(1), 2: formatMoney(sumVisibleColumn(2)) },
  }[selectedReport] || { 0: "TOTAL" };

  function downloadReport(format) {
    const rows = [activeTable.columns, ...visibleReportRows];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const extension = format === "Excel" ? "xls" : "csv";
    const type = format === "Excel" ? "application/vnd.ms-excel" : "text/csv";
    const blob = new Blob([csv], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedReport.toLowerCase().replaceAll(" ", "-")}-${range.toLowerCase().replaceAll(" ", "-")}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify(`${selectedReport} ${format} downloaded`);
  }

  function handleReportAction(action) {
    if (action === "Add refund") {
      selectReport("Void and refund", false);
      notify("Refund form is below the report total");
      return;
    }
    if (action === "CSV" || action === "Excel") {
      downloadReport(action);
      return;
    }
    if (action === "Print" || action === "PDF") {
      notify(action === "PDF" ? "Use Save as PDF in print dialog" : `${selectedReport} print ready`);
      window.setTimeout(() => window.print(), 120);
    }
  }

  function saveRefund(event) {
    event.preventDefault();
    const amount = Number(refundDraft.amount);
    if (!refundDraft.billId.trim()) {
      notify("Enter bill number for refund");
      return;
    }
    if (Number.isNaN(amount) || amount <= 0) {
      notify("Enter valid refund amount");
      return;
    }
    if (refundDraft.reason.trim().length < 5) {
      notify("Enter refund reason");
      return;
    }
    const bill = salesLedger.find((entry) => entry.id === refundDraft.billId.trim() || entry.orderNumber === refundDraft.billId.trim());
    if (!bill) {
      notify("Select a completed bill before recording a refund");
      return;
    }
    const originalPaymentAmount = bill.payment === "Split"
      ? Number((bill.splitPayments || []).find((entry) => entry.method === refundDraft.payment)?.amount || 0)
      : bill.payment === refundDraft.payment ? Number(bill.total || 0) : 0;
    if (originalPaymentAmount <= 0) {
      notify(`This bill has no ${refundDraft.payment} payment to refund`);
      return;
    }
    const refundedAmount = refundLedger
      .filter((entry) => (entry.billId === bill.id || entry.billId === bill.orderNumber) && entry.payment === refundDraft.payment)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    if (amount > originalPaymentAmount - refundedAmount + 0.000001) {
      notify(`Refund exceeds the remaining ${refundDraft.payment} payment amount`);
      return;
    }
    onRefund({
      billId: bill.id,
      orderNumber: bill.orderNumber,
      amount,
      payment: refundDraft.payment,
      taxAmount: bill.total ? Number((Number(bill.tax || 0) * (amount / Number(bill.total))).toFixed(2)) : 0,
      reason: refundDraft.reason.trim(),
      status: "Refund posted",
    });
    setRefundDraft({ billId: "", amount: "", payment: "Cash", reason: "" });
    selectReport("Void and refund", false);
  }

  return (
    <section className="screen">
      <div className="panel large report-main-panel report-focus-panel print-report">
        <PanelHead title={selectedReport} icon={FileBarChart} actions={selectedReport === "Void and refund" ? ["Add refund", "Excel", "PDF", "CSV", "Print"] : ["Excel", "PDF", "CSV", "Print"]} activeAction={selectedReport === "Void and refund" ? "Add refund" : ""} onAction={handleReportAction} />
        <div className="report-focus-controls">
          <label>Report<select value={selectedReport} onChange={(event) => selectReport(event.target.value)}>{reports.map((name) => <option key={name}>{name}</option>)}</select></label>
          <div className="report-range-actions">{["Today", "7 days", "Month", "All"].map((option) => <button key={option} type="button" className={!reportDate && range === option ? "active" : ""} onClick={() => { setReportDate(""); setRange(option); notify(`${option} report range selected`); }}>{option}</button>)}</div>
        </div>
        <div className="report-control-row">
          <label>Search report<input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search this report" /></label>
          <label className="report-specific-filter">{currentFilter.label}<select value={reportFilter} onChange={(event) => setReportFilter(event.target.value)}><option value="All">All</option>{reportFilterOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label className="report-date-filter">Filter date<input type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value); notify(event.target.value ? "Date filter applied" : "Date filter cleared"); }} /></label>
          <button type="button" onClick={() => { setReportDate(""); notify("Date filter cleared"); }}>Clear date</button>
          <span>{filteredReportRows.length} rows</span>
        </div>
        {selectedReport === "Void and refund" && (
          <form className="refund-entry-panel" onSubmit={saveRefund}>
            <div><strong>Add refund</strong><span>Enter completed bill refund details here.</span></div>
            <label>Bill number<input value={refundDraft.billId} onChange={(event) => setRefundDraft((current) => ({ ...current, billId: event.target.value }))} placeholder="BILL-..." /></label>
            <label>Amount<input type="number" min="1" value={refundDraft.amount} onChange={(event) => setRefundDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
            <label>Payment<select value={refundDraft.payment} onChange={(event) => setRefundDraft((current) => ({ ...current, payment: event.target.value }))}><option>Cash</option><option>UPI</option><option>Card</option><option>Wallet</option><option>Credit</option></select></label>
            <label>Reason<input value={refundDraft.reason} onChange={(event) => setRefundDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Customer refund reason" /></label>
            <button className="primary-table-action" type="submit">Save refund</button>
          </form>
        )}
        <div className="professional-report-table">
          <ExcelReportSheet title={selectedReport} range={range} columns={activeTable.columns} rows={visibleReportRows} columnTotals={reportColumnTotals} />
        </div>
      </div>
    </section>
  );
}

function Admin({ notify, users, setUsers, currentUser, canManageAll, canManageStore, stores, activeStore, activeView, onViewChange }) {
  const [draft, setDraft] = useState({ name: "", email: "", password: "", role: "Cashier", status: "Active", storeId: activeStore.id });
  const [editingId, setEditingId] = useState(null);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const showUserEditor = activeView === "create";
  const canManageUsers = canManageStore;
  const roleAccessSummary = {
    "Restaurant Admin": "Full access to this restaurant only, including staff and store operations.",
    "Branch Manager": "Dashboard, POS, kitchen, tables, menu, inventory, reports, and settings.",
    Cashier: "POS Billing, tables, dashboard, and finance. Use this role for billing counter staff.",
    Waiter: "POS ordering, assigned tables, and kitchen order status.",
    Chef: "Kitchen Display System, production, and inventory access.",
    Accountant: "Dashboard, finance, and reports only.",
  };
  const visibleUsers = users.filter((user) => {
    if (user.storeId === "GLOBAL" || normalizeStoreId(user.storeId) !== activeStore.id) return false;
    if (!canManageAll && user.role === "Super Admin") return false;
    return true;
  });
  const roleChoices = canManageAll
    ? ["Restaurant Admin", "Branch Manager", "Cashier", "Waiter", "Chef", "Accountant"]
    : ["Branch Manager", "Cashier", "Waiter", "Chef", "Accountant"];

  function resetUserEditor() {
    setDraft({ name: "", email: "", password: "", role: "Cashier", status: "Active", storeId: activeStore.id });
    setEditingId(null);
    setShowUserPassword(false);
  }

  function closeUserEditor() {
    resetUserEditor();
    onViewChange("all");
  }

  useEffect(() => {
    if (activeView === "all") resetUserEditor();
  }, [activeView]);

  function canEditUser(user) {
    if (!canManageUsers || normalizeStoreId(user?.storeId) !== activeStore.id) return false;
    return canManageAll || !["Super Admin", "Restaurant Admin"].includes(user?.role);
  }

  function saveUser() {
    if (!canManageUsers) {
      notify("Admin permission required to create or edit users");
      return;
    }
    if (!draft.name || !draft.email || !draft.password) {
      notify("Enter user name, email, and password");
      return;
    }
    const duplicateEmail = users.some((user) => user.email.trim().toLowerCase() === draft.email.trim().toLowerCase() && user.id !== editingId);
    if (duplicateEmail) {
      notify("This email already has a Vestora login");
      return;
    }
    const allowedRole = roleChoices.includes(draft.role) ? draft.role : "Cashier";
    const scopedDraft = {
      ...draft,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      password: draft.password,
      role: allowedRole,
      status: draft.status || "Active",
      storeId: activeStore.id,
    };
    if (editingId) {
      const targetUser = users.find((user) => user.id === editingId);
      if (!canEditUser(targetUser)) {
        notify("Super Admin permission required to edit admin accounts");
        return;
      }
      setUsers((current) => current.map((user) => {
        if (user.id !== editingId) return user;
        if (normalizeStoreId(user.storeId) !== activeStore.id) return user;
        return { ...user, ...scopedDraft };
      }));
      notify("User updated");
    } else {
      setUsers((current) => [...current, { ...scopedDraft, id: Date.now() }]);
      notify("New user created");
    }
    closeUserEditor();
  }

  function editUser(user) {
    if (!canEditUser(user)) {
      notify(canManageAll ? "You can edit users from your store only" : "Super Admin permission required to edit admin accounts");
      return;
    }
    setDraft({ name: user.name, email: user.email, password: user.password || "", role: user.role, status: user.status, storeId: user.storeId || activeStore.id });
    setEditingId(user.id);
    onViewChange("create");
  }

  function deleteUser(id) {
    const user = users.find((item) => item.id === id);
    if (!canEditUser(user)) {
      notify(canManageAll ? "You can delete users from your store only" : "Super Admin permission required to delete admin accounts");
      return;
    }
    setUsers((current) => current.filter((user) => user.id !== id));
    notify("User deleted");
  }

  return (
    <section className="screen">
      <div className="metric-grid compact">
        <Metric icon={Building2} label={canManageAll ? "Restaurants" : "Current store"} value={canManageAll ? String(stores.length) : activeStore.name} trend={canManageAll ? "Global control" : activeStore.branch} />
        <Metric icon={Store} label="Access scope" value={canManageAll ? "Overall" : "Store only"} trend={canManageAll ? "All stores" : activeStore.id} />
        <Metric icon={Users} label="Users" value={String(visibleUsers.length)} trend="This store" />
        <Metric icon={ShieldCheck} label="Permission" value={canManageAll ? "Super" : "Admin"} trend={canManageAll ? "Create stores" : "Manage store"} />
      </div>
      <section className="user-management-workspace">
        <div className="user-management-head">
          <div>
            <span>Team access</span>
            <h2>{activeStore.branch} users</h2>
            <p>Manage staff logins and access for this branch.</p>
          </div>
        </div>
        <div className={showUserEditor && canManageUsers ? "user-management-layout editor-open" : "user-management-layout"}>
        {canManageUsers && showUserEditor && (
          <div className="panel user-editor-panel">
            <PanelHead title={editingId ? "Edit user" : "Create user"} icon={UserPlus} actions={["Close"]} onAction={closeUserEditor} />
            <div className="user-form">
              <p className="permission-note">Create staff accounts for {storeLabel(activeStore)}. Select <strong>Cashier</strong> for POS billing staff.</p>
              <label>Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Employee name" /></label>
              <label>Email<input value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="user@restaurant.com" /></label>
              <label>Password
                <span className="password-field">
                  <input value={draft.password} type={showUserPassword ? "text" : "password"} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Set login password" />
                  <button type="button" onClick={() => setShowUserPassword((value) => !value)} title={showUserPassword ? "Hide password" : "Show password"}>
                    {showUserPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              <label>Role<select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}>{roleChoices.map((role) => <option key={role}>{role}</option>)}</select></label>
              <label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option><option>Suspended</option></select></label>
              <div className="role-access-card">
                <strong>{draft.role === "Cashier" ? "Cashier - POS Billing" : draft.role}</strong>
                <span>{roleAccessSummary[draft.role]}</span>
              </div>
              <button className="login-submit" onClick={saveUser}>{editingId ? "Update user" : "Create new user"}</button>
            </div>
          </div>
        )}
        {!showUserEditor && <div className="panel table-panel user-list-panel">
          <PanelHead title="User access" icon={Users} actions={["Export"]} onAction={() => notify("Users exported")} />
          {!canManageUsers && <p className="permission-note">Logged in as {currentUser.name}. User creation is available only for an administrator.</p>}
          {canManageUsers && !visibleUsers.length && <div className="user-empty-state"><Users size={22} /><strong>No staff users yet</strong><span>Create the first user for this branch.</span></div>}
          {visibleUsers.length > 0 && <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Status</th>{canManageUsers && <th>Actions</th>}</tr></thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.storeId === "GLOBAL" ? "Global" : stores.find((store) => store.id === normalizeStoreId(user.storeId))?.branch || activeStore.branch}</td>
                  <td>{user.status}</td>
                  {canManageUsers && <td><div className="row-actions"><button disabled={!canEditUser(user)} onClick={() => editUser(user)}>Edit</button><button disabled={!canEditUser(user)} onClick={() => deleteUser(user.id)}>Delete</button></div></td>}
                </tr>
              ))}
            </tbody>
          </table>
          }
        </div>}
        </div>
      </section>
    </section>
  );
}

function KotPrinterSetup({ kotPrinter, setKotPrinter, notify, canManage }) {
  function update(field, value) {
    setKotPrinter((current) => ({ ...current, [field]: value, enabled: false, status: "Disconnected" }));
  }

  function canConnectPrinter(printer) {
    if (!printer.name?.trim()) return false;
    if (printer.type === "Thermal LAN printer") {
      const hasValidIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(printer.ip || "");
      const hasValidPort = Number(printer.port) > 0 && Number(printer.port) <= 65535;
      return hasValidIp && hasValidPort;
    }
    return true;
  }

  function connectPrinter() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    setKotPrinter((current) => ({ ...current, enabled: false, status: "Checking connection" }));
    window.setTimeout(() => {
      setKotPrinter((current) => {
        if (!canConnectPrinter(current)) {
          notify("KOT printer connection failed. Check printer details");
          return { ...current, enabled: false, status: "Disconnected" };
        }
        notify("KOT printer connected successfully");
        return { ...current, enabled: true, status: "Connected" };
      });
    }, 500);
  }

  function disconnectPrinter() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    setKotPrinter((current) => ({ ...current, enabled: false, status: "Disconnected" }));
    notify("KOT printer disconnected");
  }

  function testPrinter() {
    if (!kotPrinter.enabled || kotPrinter.status !== "Connected") {
      notify("Connect KOT printer first");
      return;
    }
    notify(`Test KOT sent to ${kotPrinter.name}`);
    window.setTimeout(() => window.print(), 100);
  }

  return (
    <div className="kot-printer-editor">
      <div className="printer-status-card">
        <span className={kotPrinter.enabled && kotPrinter.status === "Connected" ? "pill online" : "pill offline"}>{kotPrinter.status}</span>
        <strong>{kotPrinter.name}</strong>
        <em>{kotPrinter.type} / {kotPrinter.paper}</em>
      </div>
      <div className="kot-printer-fields">
        <label>Printer name<input list="vestora-kot-printer-choices" value={kotPrinter.name} onChange={(event) => update("name", event.target.value)} disabled={!canManage} placeholder="Select or enter printer name" /><datalist id="vestora-kot-printer-choices">{printerChoices.map((printer) => <option key={printer} value={printer} />)}</datalist></label>
        <label>Connection type<select value={kotPrinter.type} onChange={(event) => update("type", event.target.value)} disabled={!canManage}><option>Thermal LAN printer</option><option>USB thermal printer</option><option>Bluetooth printer</option><option>Windows default printer</option></select></label>
        <label>IP address<input value={kotPrinter.ip} onChange={(event) => update("ip", event.target.value)} disabled={!canManage} /></label>
        <label>Port<input value={kotPrinter.port} onChange={(event) => update("port", event.target.value)} disabled={!canManage} /></label>
        <label>Paper size<select value={kotPrinter.paper} onChange={(event) => update("paper", event.target.value)} disabled={!canManage}><option>80mm</option><option>58mm</option></select></label>
        <label>Copies<input type="number" min="1" max="5" value={kotPrinter.copies} onChange={(event) => update("copies", Number(event.target.value || 1))} disabled={!canManage} /></label>
      </div>
      <label className="kot-toggle"><input type="checkbox" checked={kotPrinter.autoPrint} onChange={(event) => update("autoPrint", event.target.checked)} disabled={!canManage} /> Auto send KOT to kitchen queue when order is created</label>
      <div className="editor-row">
        <button onClick={connectPrinter} disabled={!canManage}>Connect printer</button>
        <button onClick={testPrinter}>Test KOT</button>
        <button onClick={disconnectPrinter} disabled={!canManage}>Disconnect</button>
      </div>
      <div className="print-kot test-kot">
        <div className="kot-ticket-head"><strong>KITCHEN ORDER TICKET</strong><span>TEST-KOT</span></div>
        <div className="kot-meta"><span>Type <strong>Test</strong></span><span>Printer <strong>{kotPrinter.name}</strong></span></div>
        <div className="kot-lines"><p>1 Paneer Tikka Bowl</p><p>2 Masala Chaas</p></div>
        <small>VESTORA KDS TEST PRINT</small>
      </div>
    </div>
  );
}

function buildSettingsDefaults(activeStore, billTemplate) {
  return {
    ...Object.fromEntries(Object.keys(settingsSectionConfig).map((name) => [name, settingsSectionConfig[name].defaults])),
    "Restaurant profile": {
      ...settingsSectionConfig["Restaurant profile"].defaults,
      restaurantName: activeStore?.name || settingsSectionConfig["Restaurant profile"].defaults.restaurantName,
      legalName: activeStore?.legalName || settingsSectionConfig["Restaurant profile"].defaults.legalName,
      phone: activeStore?.phone || billTemplate?.phone || settingsSectionConfig["Restaurant profile"].defaults.phone,
      email: activeStore?.email || billTemplate?.email || settingsSectionConfig["Restaurant profile"].defaults.email,
    },
    "Branch settings": {
      ...settingsSectionConfig["Branch settings"].defaults,
      branchName: activeStore?.branch || settingsSectionConfig["Branch settings"].defaults.branchName,
      address: activeStore?.address || billTemplate?.address || settingsSectionConfig["Branch settings"].defaults.address,
      counterCode: activeStore?.counterCode || settingsSectionConfig["Branch settings"].defaults.counterCode,
      hours: activeStore?.hours || settingsSectionConfig["Branch settings"].defaults.hours,
    },
    "GST and FSSAI": {
      ...settingsSectionConfig["GST and FSSAI"].defaults,
      gst: billTemplate?.gst || settingsSectionConfig["GST and FSSAI"].defaults.gst,
      fssai: billTemplate?.fssai || settingsSectionConfig["GST and FSSAI"].defaults.fssai,
    },
    "Print bill format": {
      ...settingsSectionConfig["Print bill format"].defaults,
      header: billTemplate?.restaurantName || activeStore?.name || settingsSectionConfig["Print bill format"].defaults.header,
      footer: billTemplate?.footer || settingsSectionConfig["Print bill format"].defaults.footer,
      paper: billTemplate?.printerSize || settingsSectionConfig["Print bill format"].defaults.paper,
      showLogo: billTemplate?.showLogo === false ? "Logo disabled" : "Logo enabled",
    },
  };
}

function SettingsManagement({ notify, canManage, activeStore, setStores, billTemplate, setBillTemplate, kotPrinter, setKotPrinter, themeConfig, setThemeConfig, setDark, activeSection, onBack }) {
  const defaultSettings = buildSettingsDefaults(activeStore, billTemplate);
  const settingsStorageKey = `vestora-active-settings-${activeStore?.id || "global"}`;
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(settingsStorageKey) || localStorage.getItem("vestora-active-settings");
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const config = settingsSectionConfig[activeSection];
  const draft = activeSection === "Theme and language"
    ? { ...(settings[activeSection] || config.defaults), theme: themeConfig.mode, themePreset: themeConfig.preset, primaryColor: themeConfig.primaryColor, accentColor: themeConfig.accentColor, sidebarColor: themeConfig.sidebarColor, backgroundColor: themeConfig.backgroundColor, surfaceColor: themeConfig.surfaceColor, textColor: themeConfig.textColor, mutedColor: themeConfig.mutedColor }
    : settings[activeSection] || config.defaults;

  useEffect(() => {
    const saved = localStorage.getItem(settingsStorageKey);
    setSettings(saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings);
  }, [settingsStorageKey]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }, [settings, settingsStorageKey]);

  function update(field, value) {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    if (activeSection === "Theme and language") {
      const nextTheme = { ...draft, [field]: value };
      if (field === "themePreset" && themePresets[value]) {
        Object.assign(nextTheme, themePresets[value], { themePreset: value });
      }
      if (themeColorFields.some(([key]) => key === field)) {
        nextTheme.themePreset = "Custom";
      }
      if (["backgroundColor", "surfaceColor"].includes(field)) {
        const readableBackground = safeColorValue(nextTheme.surfaceColor || nextTheme.backgroundColor || value, "#ffffff");
        nextTheme.textColor = readableTextColor(readableBackground);
        nextTheme.mutedColor = readableMutedColor(readableBackground);
      }
      setThemeConfig(normalizeThemeConfig({
        mode: nextTheme.theme,
        preset: nextTheme.themePreset,
        primaryColor: nextTheme.primaryColor,
        accentColor: nextTheme.accentColor,
        sidebarColor: nextTheme.sidebarColor,
        backgroundColor: nextTheme.backgroundColor,
        surfaceColor: nextTheme.surfaceColor,
        textColor: nextTheme.textColor,
        mutedColor: nextTheme.mutedColor,
      }));
      setDark(nextTheme.theme === "Dark");
      setSettings((current) => ({ ...current, [activeSection]: { ...(current[activeSection] || config.defaults), ...nextTheme } }));
      return;
    }
    setSettings((current) => ({ ...current, [activeSection]: { ...(current[activeSection] || config.defaults), [field]: value } }));
  }

  function saveSettings() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    applySettingsToStore(activeSection, draft);
    notify(`${activeSection} saved`);
  }

  function resetSection() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    if (activeSection === "Theme and language") {
      setThemeConfig(defaultThemeConfig);
      setDark(false);
    }
    setSettings((current) => ({ ...current, [activeSection]: settingsSectionConfig[activeSection].defaults }));
    notify(`${activeSection} reset`);
  }

  function runSectionAction() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    applySettingsToStore(activeSection, draft);
    notify(`${config.action} completed`);
  }

  function testPrinterRouting() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    if (!draft.kotPrinter?.trim()) {
      notify("Enter a KOT printer name before testing");
      return;
    }
    setSettings((current) => ({ ...current, [activeSection]: { ...(current[activeSection] || config.defaults), connectionStatus: "Testing connection" } }));
    setKotPrinter((current) => ({ ...current, name: draft.kotPrinter, enabled: false, status: "Checking connection" }));
    window.setTimeout(() => {
      setSettings((current) => ({ ...current, [activeSection]: { ...(current[activeSection] || config.defaults), connectionStatus: "Connected" } }));
      setKotPrinter((current) => ({ ...current, name: draft.kotPrinter, enabled: true, status: "Connected" }));
      notify("Printer routing is active. KOT printer connected successfully");
    }, 500);
  }

  function applySettingsToStore(section, values) {
    if (section === "Theme and language") {
      setThemeConfig(normalizeThemeConfig({
        mode: values.theme,
        preset: values.themePreset,
        primaryColor: values.primaryColor,
        accentColor: values.accentColor,
        sidebarColor: values.sidebarColor,
        backgroundColor: values.backgroundColor,
        surfaceColor: values.surfaceColor,
        textColor: values.textColor,
        mutedColor: values.mutedColor,
      }));
      setDark(values.theme === "Dark");
    }
    if (section === "Restaurant profile") {
      const nextName = values.restaurantName?.trim();
      if (nextName) {
        setStores((current) => current.map((store) => store.id === activeStore.id ? { ...store, name: nextName, legalName: values.legalName, phone: values.phone, email: values.email } : store));
        setBillTemplate((current) => ({ ...current, restaurantName: nextName }));
      }
      if (values.phone || values.email) {
        setBillTemplate((current) => ({ ...current, phone: values.phone || current.phone, email: values.email || current.email }));
      }
    }
    if (section === "Branch settings") {
      const nextBranch = values.branchName?.trim();
      if (nextBranch) {
        setStores((current) => current.map((store) => store.id === activeStore.id ? {
          ...store,
          branch: nextBranch,
          address: values.address,
          counterCode: values.counterCode,
          hours: values.hours,
        } : store));
      }
      if (values.address) setBillTemplate((current) => ({ ...current, address: values.address }));
    }
    if (section === "GST and FSSAI") {
      setBillTemplate((current) => ({ ...current, gst: values.gst || current.gst, fssai: values.fssai || current.fssai }));
    }
    if (section === "Print bill format") {
      setBillTemplate((current) => ({
        ...current,
        restaurantName: values.header || current.restaurantName,
        footer: values.footer || current.footer,
        printerSize: values.paper || current.printerSize,
        showLogo: values.showLogo ? values.showLogo !== "Logo disabled" : current.showLogo,
      }));
    }
  }

  const selectedLanguage = languageOptions.includes(draft.language) ? draft.language : "English";
  const selectedCurrency = currencyOptions.some(([code]) => code === draft.currency) ? draft.currency : "INR";
  const selectedTimezone = placeTimezoneOptions.some(([zone]) => zone === draft.timezone) ? draft.timezone : "Asia/Kolkata";

  return (
    <section className="screen settings-detail-screen">
      <button className="settings-back-button" onClick={onBack}><PanelLeftClose size={17} /> Back to settings</button>
      <div className="panel settings-detail-panel">
          {activeSection === "Print bill format" ? (
            <>
              <PanelHead title="Print bill format" icon={Printer} actions={canManage ? ["Save"] : []} onAction={() => notify("Print bill format saved")} />
              {canManage ? <BillTemplateEditor billTemplate={billTemplate} setBillTemplate={setBillTemplate} notify={notify} /> : <p className="permission-note">Admin permission required.</p>}
            </>
          ) : (
            <>
              <PanelHead title={activeSection} icon={Settings} actions={canManage ? ["Save", config.action, "Reset"] : []} onAction={(action) => {
                if (action === "Save") saveSettings();
                if (action === "Reset") resetSection();
                if (action === config.action) activeSection === "Printer setup" ? testPrinterRouting() : runSectionAction();
              }} />
              <p className="settings-description">{config.description}</p>
              {activeSection === "Printer setup" && <div className={`settings-printer-status ${draft.connectionStatus === "Connected" ? "connected" : ""}`}><span className={draft.connectionStatus === "Connected" ? "active-chip" : "pill offline"}>{draft.connectionStatus || "Not connected"}</span><div><strong>{draft.connectionStatus === "Connected" ? "Printer routing is active" : "Test the KOT printer to activate routing"}</strong><small>{draft.connectionStatus === "Connected" ? `${draft.kotPrinter} receives new kitchen tickets.` : "The KOT printer will display as connected only after a successful test."}</small></div></div>}
              {activeSection === "Theme and language" ? (
                <div className="theme-studio">
                  <div className="theme-studio-hero" style={{ background: `linear-gradient(135deg, ${draft.sidebarColor}, ${draft.primaryColor})` }}>
                    <div>
                      <span>Website appearance</span>
                      <h3>{draft.themePreset || "Custom"} / {draft.theme}</h3>
                      <p>Choose a preset, tune every important website color, and VESTORA will adjust letter contrast for clear reading.</p>
                    </div>
                    <Sparkles size={34} />
                  </div>

                  <div className="theme-control-row">
                    <div>
                      <span className="theme-control-label">Display mode</span>
                      <div className="theme-segment">
                        {["Light", "Dark"].map((mode) => (
                          <button key={mode} className={draft.theme === mode ? "active" : ""} onClick={() => update("theme", mode)} disabled={!canManage}>
                            {mode === "Light" ? <Sun size={16} /> : <Moon size={16} />}
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="theme-control-label">Language / currency / place</span>
                      <div className="theme-local-grid">
                        <label>
                          <span>Language</span>
                          <select value={selectedLanguage} onChange={(event) => update("language", event.target.value)} disabled={!canManage}>
                            {languageOptions.map((language) => <option key={language}>{language}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Currency</span>
                          <select value={selectedCurrency} onChange={(event) => update("currency", event.target.value)} disabled={!canManage}>
                            {currencyOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Place / timezone</span>
                          <select value={selectedTimezone} onChange={(event) => update("timezone", event.target.value)} disabled={!canManage}>
                            {placeTimezoneOptions.map(([zone, label]) => <option key={zone} value={zone}>{label} ({zone})</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="theme-preset-grid">
                    {[...Object.keys(themePresets), "Custom"].map((preset) => {
                      const colors = preset === "Custom" ? draft : themePresets[preset];
                      return (
                        <button key={preset} className={draft.themePreset === preset ? "theme-preset-card active" : "theme-preset-card"} onClick={() => update("themePreset", preset)} disabled={!canManage}>
                          <span className="theme-preset-swatches">
                            {["sidebarColor", "primaryColor", "accentColor"].map((key) => <i key={key} style={{ background: colors[key] }} />)}
                          </span>
                          <strong>{preset}</strong>
                        </button>
                      );
                    })}
                  </div>

                  <div className="theme-color-grid">
                    {themeColorFields.map(([field, label, helper]) => (
                      <label key={field} className="theme-color-card">
                        <span>
                          <strong>{label}</strong>
                          <small>{helper}</small>
                        </span>
                        <span className="theme-color-input">
                          <input type="color" value={safeColorValue(draft[field], config.defaults[field])} onChange={(event) => update(field, event.target.value)} disabled={!canManage} />
                          <input value={draft[field] || ""} onChange={(event) => update(field, event.target.value)} disabled={!canManage} />
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="theme-live-preview" style={themeStyleVariables({ ...draft, mode: draft.theme, preset: draft.themePreset })}>
                    <aside>
                      <strong>VESTORA</strong>
                      <span className="active">Dashboard</span>
                      <span>POS Billing</span>
                      <span>Settings</span>
                    </aside>
                    <section>
                      <div className="theme-preview-top">
                        <span>Live preview</span>
                        <button>Primary action</button>
                      </div>
                      <div className="theme-preview-cards">
                        <article><small>Sales</small><strong>₹42,800</strong><em>+12%</em></article>
                        <article><small>Orders</small><strong>126</strong><em>Today</em></article>
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="menu-form-grid">
                  {config.fields.map(([field, label]) => (
                    <label key={field}>{label}
                      {activeSection === "Printer setup" && ["billPrinter", "kotPrinter", "counterPrinter"].includes(field) ? (
                        <input list="vestora-printer-choices" value={draft[field] || ""} onChange={(event) => update(field, event.target.value)} disabled={!canManage} placeholder="Select or enter printer name" />
                      ) : <input value={draft[field] || ""} onChange={(event) => update(field, event.target.value)} disabled={!canManage} />}
                    </label>
                  ))}
                </div>
              )}
              {activeSection === "Printer setup" && <datalist id="vestora-printer-choices">{printerChoices.map((printer) => <option key={printer} value={printer} />)}</datalist>}
              {!canManage && <p className="permission-note">Admin permission required to edit settings.</p>}
              <div className="row-actions menu-admin-actions">
                <button onClick={saveSettings} disabled={!canManage}>Save settings</button>
                <button onClick={activeSection === "Printer setup" ? testPrinterRouting : runSectionAction} disabled={!canManage}>{config.action}</button>
                <button onClick={resetSection} disabled={!canManage}>Reset section</button>
              </div>
              <div className="settings-preview">
                <strong>Current {activeSection}</strong>
                {config.fields.map(([field, label]) => <span key={field}>{label}<em>{draft[field] || "Not set"}</em></span>)}
              </div>
            </>
          )}
      </div>
    </section>
  );
}

const attendanceTabs = ["Add Face ID", "Face Check In/Out", "Attendance Report", "Attendance Records", "Leave Requests", "Payroll Summary", "Settings"];
const defaultAttendanceTab = attendanceTabs[0];

const defaultAttendanceSettings = {
  confidenceThreshold: 56,
  cooldownMinutes: 0,
  shiftStart: "09:30",
  fullDayHours: 8,
  halfDayHours: 4,
  overtimeAfter: 9,
  storeFaceImages: false,
  deviceId: "SHOP-FIXED-CAM-01",
};

function isAdminCreatedAttendanceUser(user, activeStore) {
  const starterIds = new Set(starterUsers.map((item) => String(item.id)));
  const starterEmails = new Set(starterUsers.map((item) => item.email?.toLowerCase()));
  const blockedRoles = new Set(["Super Admin", "Restaurant Admin", "supplier"]);
  return normalizeStoreId(user.storeId) === activeStore.id
    && user.status === "Active"
    && !blockedRoles.has(user.role)
    && !starterIds.has(String(user.id))
    && !starterEmails.has(String(user.email || "").toLowerCase());
}

function buildAttendanceEmployees(users, activeStore, savedEmployees = []) {
  const savedByUserId = new Map(savedEmployees.map((employee) => [String(employee.userId), employee]));
  return users
    .filter((user) => isAdminCreatedAttendanceUser(user, activeStore))
    .map((user, index) => {
      const saved = savedByUserId.get(String(user.id)) || {};
      return {
        id: `EMP-${user.id}`,
        userId: user.id,
        name: user.name || user.email || `Employee ${index + 1}`,
        code: saved.code || `VST-${String(index + 1).padStart(3, "0")}`,
        mobile: user.mobile || saved.mobile || "",
        designation: user.role || saved.designation || "Staff",
        salary: Number(user.salary || saved.salary || 0),
        overtimeRate: Number(saved.overtimeRate || 0),
        active: user.status === "Active",
        faceDescriptor: saved.faceDescriptor || [],
        faceConsent: Boolean(saved.faceConsent),
        faceEnrolledAt: saved.faceEnrolledAt || "",
        faceSamples: Number(saved.faceSamples || 0),
        faceStoreImages: Boolean(saved.faceStoreImages),
      };
    });
}

function formatAttendanceTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatAttendanceDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, (new Date(end) - new Date(start)) / 36e5);
}

function formatAttendanceDuration(start, end, currentTime = new Date()) {
  const finishTime = end || currentTime;
  const totalSeconds = Math.max(0, Math.floor((new Date(finishTime) - new Date(start)) / 1000));
  if (!end) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatWorkedSeconds(totalSeconds, includeSeconds = false) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (!includeSeconds) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  const seconds = safeSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function calculateAttendanceStatus(log, settings) {
  if (!log.checkIn) return "Absent";
  const total = hoursBetween(log.checkIn, log.checkOut || new Date().toISOString());
  if (total < Number(settings.halfDayHours || 4)) return "Half day";
  const inTime = new Date(log.checkIn).toTimeString().slice(0, 5);
  return inTime > settings.shiftStart ? "Late" : "Present";
}

function averageFaceDescriptors(samples) {
  if (!samples.length) return [];
  const length = samples[0].length;
  return Array.from({ length }, (_, index) => {
    const total = samples.reduce((sum, sample) => sum + Number(sample[index] || 0), 0);
    return Number((total / samples.length).toFixed(8));
  });
}

function euclideanDistance(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, value, index) => sum + ((Number(value) - Number(b[index])) ** 2), 0));
}

const faceMatchDistance = {
  strict: 0.42,
  loose: 0.68,
};

function maxFaceDistanceForThreshold(confidenceThreshold) {
  const threshold = Math.max(30, Math.min(95, Number(confidenceThreshold || 56)));
  if (threshold <= 56) {
    const relaxedRange = faceMatchDistance.loose - 0.6;
    return faceMatchDistance.loose - ((threshold - 30) / 26) * relaxedRange;
  }
  const strictRange = 0.6 - faceMatchDistance.strict;
  return 0.6 - ((threshold - 56) / 39) * strictRange;
}

function faceDistanceToConfidence(distance) {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= faceMatchDistance.strict) {
    return Math.max(88, Math.min(100, Math.round(100 - (distance / faceMatchDistance.strict) * 12)));
  }
  const range = faceMatchDistance.loose - faceMatchDistance.strict;
  return Math.max(0, Math.min(88, Math.round(88 - ((distance - faceMatchDistance.strict) / range) * 58)));
}

function bestFaceMatch(descriptor, employees, confidenceThreshold) {
  const enrolled = employees.filter((employee) => employee.active && employee.faceConsent && employee.faceDescriptor?.length);
  if (!descriptor?.length || !enrolled.length) return null;
  const matches = enrolled.map((employee) => {
    const distance = euclideanDistance(descriptor, employee.faceDescriptor);
    const confidence = faceDistanceToConfidence(distance);
    return { employee, distance, confidence };
  }).sort((a, b) => a.distance - b.distance);
  const best = matches[0];
  return best && best.distance <= maxFaceDistanceForThreshold(confidenceThreshold) ? best : null;
}

function downloadCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AttendanceModule({ notify, activeStore, users, canManage, canManageAll, activeView = defaultAttendanceTab, onViewChange, onOpenAdmin }) {
  const employeesKey = `vestora-attendance-employees-${activeStore.id}`;
  const logsKey = `vestora-attendance-logs-${activeStore.id}`;
  const settingsKey = `vestora-attendance-settings-${activeStore.id}`;
  const leaveRequestsKey = `vestora-leave-requests-${activeStore.id}`;
  const activeTab = activeView === "Attendance Logs" ? "Attendance Records" : (attendanceTabs.includes(activeView) ? activeView : defaultAttendanceTab);
  const [employees, setEmployees] = useState(() => {
    const saved = loadStoredArray(employeesKey);
    return buildAttendanceEmployees(users, activeStore, saved);
  });
  const [logs, setLogs] = useState(() => loadStoredArray(logsKey));
  const [leaveRequests, setLeaveRequests] = useState(() => loadStoredArray(leaveRequestsKey));
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" });
  const [settings, setSettings] = useState(() => {
    const saved = loadStoredObject(settingsKey);
    return saved ? { ...defaultAttendanceSettings, ...saved } : defaultAttendanceSettings;
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [payrollRatesOpen, setPayrollRatesOpen] = useState(false);
  const [logFilters, setLogFilters] = useState({ date: new Date().toISOString().slice(0, 10), employee: "", status: "" });
  const [attendanceRecordRange, setAttendanceRecordRange] = useState({ start: "", end: "" });
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [scanStatus, setScanStatus] = useState("Camera idle");
  const [cameraError, setCameraError] = useState("");
  const [faceApiStatus, setFaceApiStatus] = useState("Face model not loaded");
  const [matchedFace, setMatchedFace] = useState(null);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [kioskNow, setKioskNow] = useState(() => new Date());
  const [attendanceNow, setAttendanceNow] = useState(() => new Date());
  const [currentDescriptor, setCurrentDescriptor] = useState([]);
  const [samples, setSamples] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceApiRef = useRef(null);
  const scanTimerRef = useRef(null);
  const employeesRef = useRef(employees);
  const settingsRef = useRef(settings);
  const canManageAttendance = canManage || canManageAll;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) || employees[0];
  const manualEmployee = employees.find((employee) => employee.id === manualEmployeeId);
  const enrolledCount = employees.filter((employee) => employee.faceConsent && employee.faceDescriptor?.length).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((log) => log.date === todayKey);
  const openLogs = todayLogs.filter((log) => !log.checkOut).length;
  const openLogByEmployeeId = new Map(todayLogs.filter((log) => !log.checkOut).map((log) => [log.employeeId, log]));

  useEffect(() => {
    const saved = loadStoredArray(employeesKey);
    setEmployees(buildAttendanceEmployees(users, activeStore, saved));
    setLogs(loadStoredArray(logsKey));
    setLeaveRequests(loadStoredArray(leaveRequestsKey));
    setLeaveForm({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" });
    const savedSettings = loadStoredObject(settingsKey);
    setSettings(savedSettings ? { ...defaultAttendanceSettings, ...savedSettings } : defaultAttendanceSettings);
    setSelectedEmployeeId("");
    setManualEmployeeId("");
    setSamples([]);
  }, [activeStore.id, users]);

  useEffect(() => {
    localStorage.setItem(employeesKey, JSON.stringify(employees));
    employeesRef.current = employees;
  }, [employees, employeesKey]);

  useEffect(() => {
    localStorage.setItem(logsKey, JSON.stringify(logs));
  }, [logs, logsKey]);

  useEffect(() => {
    localStorage.setItem(leaveRequestsKey, JSON.stringify(leaveRequests));
  }, [leaveRequests, leaveRequestsKey]);

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    settingsRef.current = settings;
  }, [settings, settingsKey]);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().then(startScanning).catch(() => setScanStatus("Camera preview waiting"));
  }, [activeTab]);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (activeTab !== "Face Check In/Out") return undefined;
    setKioskNow(new Date());
    const clockTimer = window.setInterval(() => setKioskNow(new Date()), 1000);
    return () => window.clearInterval(clockTimer);
  }, [activeTab]);

  useEffect(() => {
    if (!logs.some((log) => !log.checkOut)) return undefined;
    setAttendanceNow(new Date());
    const workedTimeTimer = window.setInterval(() => setAttendanceNow(new Date()), 1000);
    return () => window.clearInterval(workedTimeTimer);
  }, [logs]);

  useEffect(() => {
    if (!attendanceResult) return undefined;
    const resultTimer = window.setTimeout(() => setAttendanceResult(null), 4500);
    return () => window.clearTimeout(resultTimer);
  }, [attendanceResult]);

  async function loadFaceApi() {
    if (faceApiRef.current) return faceApiRef.current;
    setFaceApiStatus("Loading local face-api models");
    try {
      const faceApiModelsPath = publicAssetPath("models/face-api");
      const faceapi = await import("@vladmandic/face-api");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(faceApiModelsPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(faceApiModelsPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(faceApiModelsPath),
      ]);
      faceApiRef.current = faceapi;
      setFaceApiStatus("Local face recognition ready");
      return faceapi;
    } catch {
      setFaceApiStatus("Face recognition models are missing");
      throw new Error("Face recognition model files are missing");
    }
  }

  async function startCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 960, height: 540 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanStatus("Camera ready");
    } catch (error) {
      setCameraError("Camera permission denied or no camera found");
      setScanStatus("Camera unavailable");
      return;
    }
    try {
      await loadFaceApi();
      setCameraError("");
      startScanning();
    } catch (error) {
      setCameraError(error.message);
      setScanStatus("Face model unavailable");
    }
  }

  function stopCamera() {
    window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanStatus("Camera idle");
  }

  function startScanning() {
    window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = window.setInterval(async () => {
      if (!faceApiRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const faceapi = faceApiRef.current;
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!detection) {
          setMatchedFace(null);
          setCurrentDescriptor([]);
          setScanStatus("No face detected");
          return;
        }
        const descriptor = Array.from(detection.descriptor || []);
        const match = bestFaceMatch(descriptor, employeesRef.current, settingsRef.current.confidenceThreshold);
        setCurrentDescriptor(descriptor);
        setMatchedFace(match);
        setScanStatus(match ? `${match.employee.name} matched` : "Unknown face");
      } catch {
        setScanStatus("Face scan waiting");
      }
    }, 1400);
  }

  async function captureEnrollmentSample() {
    if (!canManageAttendance) {
      notify("Admin or HR permission required");
      return;
    }
    if (!selectedEmployee) {
      notify("Select an employee first");
      return;
    }
    if (!streamRef.current) {
      notify("Starting camera for face enrollment");
      await startCamera();
      return;
    }
    if (!currentDescriptor.length) {
      notify("Show one clear face to the camera and wait for detection");
      return;
    }
    setSamples((current) => [...current, currentDescriptor]);
    notify(`Face sample ${samples.length + 1} captured`);
  }

  function saveEnrollment() {
    if (!canManageAttendance || !selectedEmployee) {
      notify("Admin or HR permission required");
      return;
    }
    if (samples.length < 3) {
      notify("Capture at least 3 samples");
      return;
    }
    const descriptor = averageFaceDescriptors(samples);
    setEmployees((current) => current.map((employee) => employee.id === selectedEmployee.id ? {
      ...employee,
      faceDescriptor: descriptor,
      faceConsent: true,
      faceEnrolledAt: new Date().toISOString(),
      faceSamples: samples.length,
      faceStoreImages: Boolean(settings.storeFaceImages),
    } : employee));
    setSamples([]);
    onViewChange?.("Face Check In/Out");
    notify(`${selectedEmployee.name} face enrolled`);
  }

  function deleteFaceData(employeeId) {
    if (!canManageAttendance) {
      notify("Admin or HR permission required");
      return;
    }
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee?.faceDescriptor?.length) {
      notify("No Face ID saved for this employee");
      return;
    }
    if (!window.confirm(`Delete entered Face ID data for ${employee.name}?`)) return;
    setEmployees((current) => current.map((employee) => employee.id === employeeId ? {
      ...employee,
      faceDescriptor: [],
      faceConsent: false,
      faceEnrolledAt: "",
      faceSamples: 0,
      faceStoreImages: false,
    } : employee));
    setMatchedFace((current) => current?.employee.id === employeeId ? null : current);
    if (selectedEmployee?.id === employeeId) {
      setSamples([]);
    }
    notify("Face data deleted");
  }

  function markAttendance(type, employeeOverride = null) {
    const employee = employeeOverride || matchedFace?.employee || manualEmployee;
    if (!employee) {
      notify("No recognized employee selected");
      return;
    }
    const now = new Date();
    const openLog = logs.find((log) => log.employeeId === employee.id && log.date === todayKey && !log.checkOut);
    const source = employeeOverride ? "manual" : "face";
    const confidence = employeeOverride ? 100 : matchedFace?.confidence || 0;
    if (type === "out" || (type === "auto" && openLog)) {
      if (!openLog) {
        notify("No open punch-in found");
        return;
      }
      setLogs((current) => current.map((log) => log.id === openLog.id ? {
        ...log,
        checkOut: now.toISOString(),
        source,
        confidence,
        deviceId: settings.deviceId,
        status: calculateAttendanceStatus({ ...log, checkOut: now.toISOString() }, settings),
      } : log));
      setAttendanceResult({ type: "out", employeeName: employee.name, time: now.toISOString() });
      notify(`${employee.name} marked out`);
      return;
    }
    if (openLog) {
      notify(`${employee.name} is already checked in`);
      return;
    }
    const log = {
      id: `ATT-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      branch: activeStore.branch,
      storeId: activeStore.id,
      storeName: activeStore.name,
      date: todayKey,
      checkIn: now.toISOString(),
      checkOut: "",
      source,
      confidence,
      deviceId: settings.deviceId,
      status: now.toTimeString().slice(0, 5) > settings.shiftStart ? "Late" : "Present",
    };
    setLogs((current) => [log, ...current]);
    setAttendanceResult({ type: "in", employeeName: employee.name, time: now.toISOString() });
    notify(`${employee.name} marked in`);
  }

  function markManualAttendance(type, employee) {
    if (!canManageAttendance) {
      notify("Administrator permission is required for manual attendance");
      return;
    }
    markAttendance(type, employee);
  }

  function updateSetting(field, value) {
    if (!canManageAttendance) {
      notify("Admin or HR permission required");
      return;
    }
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function updateEmployeePayroll(employeeId, field, value) {
    setEmployees((current) => current.map((employee) => employee.id === employeeId ? {
      ...employee,
      [field]: Math.max(0, Number(value) || 0),
    } : employee));
  }

  function submitLeaveRequest(event) {
    event.preventDefault();
    const employee = employees.find((item) => item.id === leaveForm.employeeId);
    if (!employee || !leaveForm.from || !leaveForm.to || !leaveForm.reason.trim()) {
      notify("Complete employee, dates, and reason");
      return;
    }
    if (leaveForm.to < leaveForm.from) {
      notify("End date must be after the start date");
      return;
    }
    setLeaveRequests((current) => [{
      id: `LEAVE-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      type: leaveForm.type,
      from: leaveForm.from,
      to: leaveForm.to,
      reason: leaveForm.reason.trim(),
      status: "Pending",
      createdAt: new Date().toISOString(),
    }, ...current]);
    setLeaveForm({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" });
    notify("Leave request submitted");
  }

  function updateLeaveStatus(id, status) {
    if (!canManageAttendance) {
      notify("Admin permission is required to review leave");
      return;
    }
    setLeaveRequests((current) => current.map((request) => request.id === id ? { ...request, status, reviewedAt: new Date().toISOString() } : request));
    notify(`Leave request ${status.toLowerCase()}`);
  }

  const filteredEmployees = employees.filter((employee) => {
    const haystack = `${employee.name} ${employee.code} ${employee.mobile} ${employee.designation}`.toLowerCase();
    return haystack.includes(employeeFilter.toLowerCase());
  });
  const filteredLogs = logs.filter((log) => {
    const statusText = calculateAttendanceStatus(log, settings);
    return (!logFilters.date || log.date === logFilters.date)
      && (!logFilters.employee || log.employeeId === logFilters.employee)
      && (!logFilters.status || statusText === logFilters.status);
  });
  const payrollDaysInPeriod = (() => {
    const [year, month] = reportMonth.split("-").map(Number);
    const todayMonth = todayKey.slice(0, 7);
    return reportMonth === todayMonth ? new Date().getDate() : new Date(year, month, 0).getDate();
  })();
  const payrollRows = employees.map((employee) => {
    const employeeLogs = logs.filter((log) => log.employeeId === employee.id && log.date.startsWith(reportMonth));
    const halfDays = employeeLogs.filter((log) => {
      const hours = hoursBetween(log.checkIn, log.checkOut);
      return Boolean(log.checkOut) && hours >= Number(settings.halfDayHours || 4) && hours < Number(settings.fullDayHours || 8);
    }).length;
    const presentDays = employeeLogs.filter((log) => {
      const hours = hoursBetween(log.checkIn, log.checkOut);
      return !log.checkOut || hours >= Number(settings.fullDayHours || 8);
    }).length;
    const lateCount = employeeLogs.filter((log) => log.checkIn && new Date(log.checkIn).toTimeString().slice(0, 5) > settings.shiftStart).length;
    const overtimeHours = employeeLogs.reduce((sum, log) => sum + Math.max(0, hoursBetween(log.checkIn, log.checkOut) - Number(settings.overtimeAfter || 9)), 0);
    const payableDays = Number((presentDays + halfDays * 0.5).toFixed(1));
    const monthlySalary = Number(employee.salary || 0);
    const overtimeRate = Number(employee.overtimeRate || 0);
    const overtimePay = Number((overtimeHours * overtimeRate).toFixed(2));
    const payableSalary = Number((((monthlySalary / Math.max(1, payrollDaysInPeriod)) * payableDays) + overtimePay).toFixed(2));
    return {
      employeeId: employee.id,
      employee: employee.name,
      code: employee.code,
      presentDays,
      absentDays: Math.max(0, payrollDaysInPeriod - presentDays - halfDays),
      halfDays,
      lateCount,
      overtimeHours: Number(overtimeHours.toFixed(2)),
      payableDays,
      monthlySalary,
      overtimeRate,
      overtimePay,
      payableSalary,
    };
  });
  const reportLogs = logs.filter((log) => log.date.startsWith(reportMonth));
  const reportFilteredLogs = logs.filter((log) => {
    const statusText = calculateAttendanceStatus(log, settings);
    return (!attendanceRecordRange.start || log.date >= attendanceRecordRange.start)
      && (!attendanceRecordRange.end || log.date <= attendanceRecordRange.end)
      && (!logFilters.employee || log.employeeId === logFilters.employee)
      && (!logFilters.status || statusText === logFilters.status);
  });
  const attendanceRecordRows = Object.values(reportFilteredLogs.reduce((groups, log) => {
    const employeeKey = log.employeeId || log.employeeCode || log.employeeName;
    const key = `${log.date}-${employeeKey}`;
    if (!groups[key]) {
      groups[key] = {
        id: key,
        date: log.date,
        employeeId: log.employeeId,
        employeeName: log.employeeName,
        employeeCode: log.employeeCode,
        checkIn: log.checkIn,
        checkOut: log.checkOut,
        logs: [log],
      };
      return groups;
    }

    const row = groups[key];
    row.logs.push(log);
    if (new Date(log.checkIn) < new Date(row.checkIn)) row.checkIn = log.checkIn;
    if (log.checkOut && (!row.checkOut || new Date(log.checkOut) > new Date(row.checkOut))) row.checkOut = log.checkOut;
    return groups;
  }, {})).map((row) => {
    const hasOpenShift = row.logs.some((log) => !log.checkOut);
    const workedSeconds = row.logs.reduce((total, log) => {
      const endTime = log.checkOut || attendanceNow;
      return total + Math.max(0, Math.floor((new Date(endTime) - new Date(log.checkIn)) / 1000));
    }, 0);
    const punchTimes = row.logs
      .flatMap((log) => [log.checkIn, log.checkOut].filter(Boolean))
      .sort((first, second) => new Date(first) - new Date(second));
    const source = row.logs.every((log) => log.source === "manual")
      ? "Manual"
      : row.logs.some((log) => log.source === "manual") ? "Face ID + Manual" : "Face ID";

    return {
      ...row,
      hasOpenShift,
      workedSeconds,
      punchTimes,
      source,
      status: hasOpenShift ? "Inside / Working" : calculateAttendanceStatus({ checkIn: row.checkIn, checkOut: row.checkOut }, settings),
    };
  }).sort((first, second) => new Date(second.checkIn) - new Date(first.checkIn));
  const recordStats = {
    shifts: attendanceRecordRows.length,
    completed: attendanceRecordRows.filter((row) => !row.hasOpenShift).length,
    open: attendanceRecordRows.filter((row) => row.hasOpenShift).length,
    people: new Set(attendanceRecordRows.map((row) => row.employeeId || row.employeeCode || row.employeeName)).size,
  };
  const reportRows = employees.map((employee) => {
    const employeeLogs = reportLogs.filter((log) => log.employeeId === employee.id);
    const workedSeconds = employeeLogs.reduce((sum, log) => {
      const endTime = log.checkOut || attendanceNow;
      return sum + Math.max(0, Math.floor((new Date(endTime) - new Date(log.checkIn)) / 1000));
    }, 0);
    const workedHours = workedSeconds / 3600;
    const presentDays = new Set(employeeLogs.map((log) => log.date)).size;
    const lateDays = employeeLogs.filter((log) => calculateAttendanceStatus(log, settings) === "Late").length;
    const halfDays = employeeLogs.filter((log) => calculateAttendanceStatus(log, settings) === "Half day").length;
    return {
      employee: employee.name,
      code: employee.code,
      designation: employee.designation,
      presentDays,
      lateDays,
      halfDays,
      workedHours: Number(workedHours.toFixed(2)),
      workedSeconds,
      openShift: employeeLogs.some((log) => !log.checkOut) ? "Open" : "Closed",
    };
  });
  const reportStats = {
    present: new Set(reportLogs.map((log) => `${log.employeeId}-${log.date}`)).size,
    late: reportLogs.filter((log) => calculateAttendanceStatus(log, settings) === "Late").length,
    open: reportLogs.filter((log) => !log.checkOut).length,
    workedSeconds: reportRows.reduce((sum, row) => sum + row.workedSeconds, 0),
  };
  const matchedEmployeeOpenLog = matchedFace ? openLogByEmployeeId.get(matchedFace.employee.id) : null;

  return (
    <section className="screen attendance-screen">
      {activeTab === "Face Check In/Out" && (
        <div className="attendance-live-grid">
          <div className="attendance-kiosk-header">
            <div>
              <span className="attendance-kiosk-eyebrow">Attendance kiosk</span>
              <h2>{activeStore.name} / {activeStore.branch}</h2>
              <p>Stand in front of the phone camera, then tap the available attendance action.</p>
            </div>
            <div className="attendance-kiosk-clock" aria-live="polite">
              <strong>{kioskNow.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
              <span>{kioskNow.toLocaleDateString([], { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="attendance-kiosk-actions">
              <button className={streamRef.current ? "attendance-camera-toggle active" : "attendance-camera-toggle"} onClick={() => streamRef.current ? stopCamera() : startCamera()}>
                <Camera size={20} />
                {streamRef.current ? "Stop scanner" : "Start face scanner"}
              </button>
              <button className="attendance-kiosk-exit" onClick={() => { stopCamera(); onViewChange?.("Add Face ID"); }}>
                <X size={20} />
                Exit kiosk
              </button>
            </div>
          </div>
          {attendanceResult && (
            <div className={`attendance-punch-result ${attendanceResult.type}`} role="status">
              <CircleCheck size={28} />
              <div>
                <strong>{attendanceResult.type === "in" ? "Check-in successful" : "Check-out successful"}</strong>
                <span>{attendanceResult.employeeName} / {formatAttendanceTime(attendanceResult.time)}</span>
              </div>
            </div>
          )}
          <div className="attendance-kiosk-body">
          <div className="panel attendance-camera-panel">
            <PanelHead title="Face scanner" icon={Camera} />
            <div className="camera-frame">
              <video ref={videoRef} muted playsInline />
              {!streamRef.current && <div className="camera-placeholder"><Camera size={34} /><strong>Camera is ready to start</strong><span>Keep the phone fixed at face height with the front camera visible.</span><button onClick={startCamera}>Start face scanner</button></div>}
              {streamRef.current && <div className="attendance-face-guide" aria-hidden="true" />}
              <div className={matchedFace ? "scan-badge matched" : "scan-badge"}>{scanStatus}</div>
            </div>
            {!enrolledCount && <p className="permission-note">First add employee Face ID. After enrollment, this camera recognizes that face for check-in and check-out.</p>}
            {cameraError && <p className="permission-note">{cameraError}</p>}
            <div className="attendance-status-strip">
              <span><Wifi size={15} /> {faceApiStatus}</span>
              <span><ShieldCheck size={15} /> Local processing only</span>
              <span><Clock size={15} /> Instant check in/out</span>
            </div>
          </div>
          <div className="panel attendance-recognition-panel">
            <PanelHead title="Employee verification" icon={UserCheck} />
            {matchedFace ? (
              <>
                <div className="matched-employee">
                  <span>{matchedFace.employee.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{matchedFace.employee.name}</h3>
                    <p>{matchedFace.employee.code} / {matchedFace.employee.designation}</p>
                  </div>
                  <strong>{matchedFace.confidence}%</strong>
                </div>
                <div className={matchedEmployeeOpenLog ? "face-attendance-state checked-in" : "face-attendance-state checked-out"}>
                  <div>
                    <span>Current attendance</span>
                    <strong aria-live="polite">{matchedEmployeeOpenLog
                      ? `Checked in at ${formatAttendanceTime(matchedEmployeeOpenLog.checkIn)} - Working ${formatAttendanceDuration(matchedEmployeeOpenLog.checkIn, "", attendanceNow)}`
                      : "Not checked in today"}</strong>
                  </div>
                </div>
                <div className="attendance-primary-actions">
                  <button className="check-in" onClick={() => markAttendance("in")} disabled={Boolean(matchedEmployeeOpenLog)}>
                    <UserCheck size={22} />
                    <span><strong>Check in</strong><small>Start work shift</small></span>
                  </button>
                  <button className="check-out" onClick={() => markAttendance("out")} disabled={!matchedEmployeeOpenLog}>
                    <LogOut size={22} />
                    <span><strong>Check out</strong><small>End work shift</small></span>
                  </button>
                </div>
              </>
            ) : (
              <div className="attendance-empty">
                <AlertTriangle size={22} />
                <strong>{streamRef.current ? (enrolledCount ? "Looking for an employee" : "No Face ID added yet") : "Start the face scanner"}</strong>
                <span>{streamRef.current ? (enrolledCount ? "Face the camera and keep still for a moment." : "Add employee Face ID before using this kiosk.") : "The employee will be identified before check-in or check-out is enabled."}</span>
              </div>
            )}
            {canManageAttendance ? (
              <>
                <div className="manual-fallback">
                  <label>Manual attendance<select value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)}>
                    <option value="">Select employee</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.code}</option>)}
                  </select></label>
                  <div className="row-actions">
                    <button onClick={() => markManualAttendance("in", manualEmployee)} disabled={!manualEmployee}>Manual In</button>
                    <button onClick={() => markManualAttendance("out", manualEmployee)} disabled={!manualEmployee}>Manual Out</button>
                  </div>
                </div>
                <div className="employee-punch-panel">
                  <h3>Employee Check In / Out</h3>
                  <p>Administrators can correct or record attendance manually.</p>
                  <div className="employee-punch-list">
                    {employees.map((employee) => {
                      const openLog = openLogByEmployeeId.get(employee.id);
                      return (
                        <div key={employee.id} className="employee-punch-row">
                          <span className={openLog ? "face-dot enrolled" : "face-dot"} />
                          <div>
                            <strong>{employee.name}</strong>
                            <small>{employee.code} / {openLog ? `Checked in at ${formatAttendanceTime(openLog.checkIn)}` : "Not checked in"}</small>
                          </div>
                          <button className={openLog ? "punch-out" : "punch-in"} onClick={() => markManualAttendance(openLog ? "out" : "in", employee)}>
                            {openLog ? "Check Out" : "Check In"}
                          </button>
                        </div>
                      );
                    })}
                    {!employees.length && <div className="attendance-empty"><Users size={22} /><strong>No employees available</strong><span>Create users in Admin first, then return here.</span></div>}
                  </div>
                </div>
              </>
            ) : (
              <div className="attendance-admin-note">
                <ShieldCheck size={18} />
                <span>Manual check-in and check-out are available to administrators only.</span>
              </div>
            )}
            <div className="attendance-mini-log">
              <h3>Recent punches</h3>
              {todayLogs.slice(0, 5).map((log) => (
                <div key={log.id}><span>{log.employeeName}</span><strong>{formatAttendanceTime(log.checkIn)} - {formatAttendanceTime(log.checkOut)}</strong></div>
              ))}
              {!todayLogs.length && <p className="permission-note">No attendance marked today.</p>}
            </div>
          </div>
          </div>
        </div>
      )}

      {activeTab === "Add Face ID" && (
        <div className="attendance-employee-grid">
          <div className="panel">
            <PanelHead title="Add Face ID" icon={UserPlus} actions={["Capture sample", "Save face"]} onAction={(action) => action === "Capture sample" ? captureEnrollmentSample() : saveEnrollment()} />
            <div className="enrollment-camera-card">
              <div className="camera-frame enrollment-camera-frame">
                <video ref={videoRef} muted playsInline />
                {!streamRef.current && <div className="camera-placeholder"><Camera size={28} /><strong>Enrollment camera</strong><span>Start camera and keep one face centered.</span></div>}
                <div className={currentDescriptor.length ? "scan-badge matched" : "scan-badge"}>{scanStatus}</div>
              </div>
              <div className="attendance-status-strip">
                <span><Camera size={15} /> {streamRef.current ? "Camera running" : "Camera idle"}</span>
                <span><ShieldCheck size={15} /> {faceApiStatus}</span>
              </div>
              <div className="row-actions">
                <button onClick={startCamera}>{streamRef.current ? "Restart camera" : "Start camera"}</button>
                <button onClick={stopCamera} disabled={!streamRef.current}>Stop camera</button>
              </div>
              {cameraError && <p className="permission-note">{cameraError}</p>}
            </div>
            <div className="attendance-enroll-controls">
              <label>Employee<select value={selectedEmployee?.id || ""} onChange={(event) => { setSelectedEmployeeId(event.target.value); setSamples([]); }}>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.code}</option>)}
              </select></label>
              <label>Samples captured<input value={`${samples.length}/5`} readOnly /></label>
            </div>
            {selectedEmployee?.faceDescriptor?.length ? (
              <div className="selected-face-id-panel">
                <div>
                  <span>Enrolled Face ID</span>
                  <strong>{selectedEmployee.name} / {selectedEmployee.faceSamples || 1} samples</strong>
                </div>
                <button className="danger-action" onClick={() => deleteFaceData(selectedEmployee.id)} disabled={!canManageAttendance}>
                  <Trash2 size={17} />
                  Delete entered data
                </button>
              </div>
            ) : (
              <div className="selected-face-id-panel muted">
                <div>
                  <span>No Face ID saved</span>
                  <strong>{selectedEmployee?.name || "Select employee"}</strong>
                </div>
              </div>
            )}
            <div className="sample-meter">{Array.from({ length: 5 }, (_, index) => <span key={index} className={samples[index] ? "filled" : ""} />)}</div>
          </div>
          <div className="panel">
            <PanelHead title="User source" icon={Users} actions={["Open Admin"]} onAction={() => onOpenAdmin?.()} />
            <div className="attendance-summary-list">
              <div><span>Eligible users</span><strong>{employees.length}</strong></div>
              <div><span>Face ID added</span><strong>{enrolledCount}</strong></div>
              <div><span>Pending Face ID</span><strong>{Math.max(0, employees.length - enrolledCount)}</strong></div>
            </div>
          </div>
          <div className="panel attendance-wide-panel">
            <PanelHead title="Employee face status" icon={ShieldCheck} actions={["Search"]} onAction={() => notify("Search employees by name, code, mobile, or role")} />
            <label className="attendance-search"><Search size={16} /><input value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} placeholder="Search staff" /></label>
            <div className="attendance-employee-list">
              {filteredEmployees.map((employee) => (
                <div key={employee.id} className="attendance-employee-row">
                  <span className={employee.faceConsent && employee.faceDescriptor?.length ? "face-dot enrolled" : "face-dot"} />
                  <div><strong>{employee.name}</strong><small>{employee.code} / {employee.designation}</small></div>
                  <em>{employee.faceConsent && employee.faceDescriptor?.length ? `${employee.faceSamples} samples` : "Not enrolled"}</em>
                  {employee.faceConsent && employee.faceDescriptor?.length ? (
                    <button onClick={() => deleteFaceData(employee.id)} disabled={!canManageAttendance}>
                      <Trash2 size={16} />
                      Delete entered data
                    </button>
                  ) : <span className="face-id-empty-action">No Face ID</span>}
                </div>
              ))}
              {!filteredEmployees.length && <div className="attendance-empty"><Users size={22} /><strong>No Admin-created users</strong><span>Create staff in Admin user creation to add Face ID here.</span></div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Attendance Report" && (
        <div className="attendance-report-stack">
          <div className="attendance-report-header">
            <div>
              <span className="attendance-kiosk-eyebrow">Branch attendance</span>
              <h2>Attendance report</h2>
              <p>Review monthly attendance, late arrivals, open shifts, and work hours.</p>
            </div>
            <div className="attendance-report-actions">
              <label>Report month<input type="month" value={reportMonth} onChange={(event) => { setReportMonth(event.target.value); setLogFilters((current) => ({ ...current, date: "" })); }} /></label>
              <button onClick={() => {
                downloadCsv(`vestora-attendance-report-${reportMonth}.csv`, ["employee", "code", "designation", "presentDays", "lateDays", "halfDays", "workedHours", "openShift"], reportRows);
                notify("Attendance report exported");
              }}><Download size={17} /> Export report</button>
            </div>
          </div>
          <div className="metric-grid compact attendance-report-metrics">
            <Metric icon={UserCheck} label="Attendance days" value={String(reportStats.present)} trend={`${employees.length} employees`} />
            <Metric icon={Clock} label="Late arrivals" value={String(reportStats.late)} trend="Selected month" />
            <Metric icon={AlertTriangle} label="Open shifts" value={String(reportStats.open)} trend={reportStats.open ? "Needs action" : "All closed"} />
            <Metric icon={CalendarClock} label="Worked hours" value={formatWorkedSeconds(reportStats.workedSeconds, reportStats.open > 0)} trend={reportStats.open ? "Live open shifts included" : "Completed shifts"} />
          </div>
          <div className="panel table-panel">
            <PanelHead title="Employee attendance summary" icon={FileBarChart} />
            <table>
              <thead><tr><th>Employee</th><th>Role</th><th>Present days</th><th>Late</th><th>Half days</th><th>Worked hours</th><th>Shift status</th></tr></thead>
              <tbody>{reportRows.map((row) => (
                <tr key={row.code}>
                  <td>{row.employee}<br /><small>{row.code}</small></td>
                  <td>{row.designation}</td>
                  <td>{row.presentDays}</td>
                  <td>{row.lateDays}</td>
                  <td>{row.halfDays}</td>
                  <td>{formatWorkedSeconds(row.workedSeconds, row.openShift === "Open")}</td>
                  <td><span className={row.openShift === "Open" ? "attendance-open-chip" : "active-chip"}>{row.openShift}</span></td>
                </tr>
              ))}</tbody>
            </table>
            {!reportRows.length && <div className="empty-table-state">No employees have been created for this branch yet.</div>}
          </div>
        </div>
      )}

      {activeTab === "Attendance Records" && (
        <div className="attendance-records-stack">
          <div className="attendance-records-intro">
            <div>
              <span className="attendance-kiosk-eyebrow">Daily punch history</span>
              <h2>Attendance records</h2>
              <p>Each row combines one employee's attendance for one date, including their Face ID punch details.</p>
            </div>
            <button onClick={() => {
              downloadCsv(`vestora-attendance-records-${attendanceRecordRange.start || "all"}-to-${attendanceRecordRange.end || "all"}.csv`, ["date", "employeeName", "employeeCode", "checkIn", "checkOut", "workedTime", "status", "punchCount", "faceIdPunches", "recordedBy"], attendanceRecordRows.map((row) => ({
                date: formatAttendanceDate(row.checkIn),
                employeeName: row.employeeName,
                employeeCode: row.employeeCode,
                checkIn: formatAttendanceTime(row.checkIn),
                checkOut: row.hasOpenShift ? "Open" : formatAttendanceTime(row.checkOut),
                workedTime: formatWorkedSeconds(row.workedSeconds, row.hasOpenShift),
                status: row.status,
                punchCount: row.punchTimes.length,
                faceIdPunches: row.punchTimes.map((time) => formatAttendanceTime(time)).join(", "),
                recordedBy: row.source,
              })));
              notify("Attendance records exported");
            }}><Download size={17} /> Export records</button>
          </div>
          <div className="attendance-record-stat-grid">
            <div><span>Employee days</span><strong>{recordStats.shifts}</strong></div>
            <div><span>Completed</span><strong>{recordStats.completed}</strong></div>
            <div><span>Open shifts</span><strong>{recordStats.open}</strong></div>
            <div><span>Employees</span><strong>{recordStats.people}</strong></div>
          </div>
          <div className="panel table-panel">
            <div className="attendance-filter-row attendance-record-filters">
              <label>Start date<input type="date" value={attendanceRecordRange.start} max={attendanceRecordRange.end || undefined} onChange={(event) => setAttendanceRecordRange((current) => ({ ...current, start: event.target.value }))} /></label>
              <label>End date<input type="date" value={attendanceRecordRange.end} min={attendanceRecordRange.start || undefined} onChange={(event) => setAttendanceRecordRange((current) => ({ ...current, end: event.target.value }))} /></label>
              <label>Employee<select value={logFilters.employee} onChange={(event) => setLogFilters((current) => ({ ...current, employee: event.target.value }))}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label>Status<select value={logFilters.status} onChange={(event) => setLogFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option>Present</option><option>Late</option><option>Half day</option></select></label>
              <button className="attendance-clear-filter" onClick={() => { setAttendanceRecordRange({ start: "", end: "" }); setLogFilters({ date: "", employee: "", status: "" }); }}>Clear</button>
            </div>
            <p className="attendance-record-note">Face ID punches are combined by employee and date. Status is calculated from the branch working-hours settings after check-out.</p>
            <table>
              <thead><tr><th>Date</th><th>Employee</th><th>First check in</th><th>Last check out</th><th>Worked time</th><th>Status</th><th>Face ID punches</th></tr></thead>
            <tbody>{attendanceRecordRows.map((row) => (
              <tr key={row.id}>
                <td>{formatAttendanceDate(row.checkIn)}</td>
                <td>{row.employeeName}<br /><small>{row.employeeCode}</small></td>
                <td>{formatAttendanceTime(row.checkIn)}</td>
                <td>{row.hasOpenShift ? "Open" : formatAttendanceTime(row.checkOut)}</td>
                <td>{formatWorkedSeconds(row.workedSeconds, row.hasOpenShift)}</td>
                <td><span className={row.status === "Late" ? "attendance-late-chip" : row.hasOpenShift ? "attendance-open-chip" : "active-chip"}>{row.status}</span></td>
                <td className="attendance-punch-details"><strong>{row.punchTimes.length} punches</strong><small>{row.punchTimes.map((time) => formatAttendanceTime(time)).join(", ")}</small><em>{row.source}</em></td>
              </tr>
            ))}</tbody>
            </table>
            {!attendanceRecordRows.length && <div className="empty-table-state">No attendance records match the selected filters.</div>}
          </div>
        </div>
      )}

      {activeTab === "Leave Requests" && (
        <div className="leave-request-grid">
          <form className="panel leave-request-form" onSubmit={submitLeaveRequest}>
            <div className="leave-request-heading">
              <div><span className="attendance-kiosk-eyebrow">Time off</span><h2>Request leave</h2><p>Submit leave for a branch employee and track its approval status.</p></div>
            </div>
            <div className="leave-form-fields">
              <label>Employee<select value={leaveForm.employeeId} onChange={(event) => setLeaveForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.code}</option>)}</select></label>
              <label>Leave type<select value={leaveForm.type} onChange={(event) => setLeaveForm((current) => ({ ...current, type: event.target.value }))}><option>Casual leave</option><option>Sick leave</option><option>Annual leave</option><option>Unpaid leave</option></select></label>
              <label>From<input type="date" value={leaveForm.from} onChange={(event) => setLeaveForm((current) => ({ ...current, from: event.target.value }))} /></label>
              <label>To<input type="date" min={leaveForm.from || undefined} value={leaveForm.to} onChange={(event) => setLeaveForm((current) => ({ ...current, to: event.target.value }))} /></label>
              <label className="leave-reason-field">Reason<textarea value={leaveForm.reason} rows="3" placeholder="Reason for leave" onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} /></label>
            </div>
            <div className="leave-request-actions"><button type="button" onClick={() => setLeaveForm({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" })}>Clear</button><button type="submit" className="primary-action">Submit request</button></div>
          </form>
          <div className="panel table-panel leave-request-list">
            <PanelHead title="Leave requests" icon={CalendarClock} actions={["Export CSV"]} onAction={() => { downloadCsv(`vestora-leave-requests-${reportMonth}.csv`, ["employee", "type", "from", "to", "reason", "status"], leaveRequests); notify("Leave requests exported"); }} />
            <table>
              <thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Reason</th><th>Status</th>{canManageAttendance && <th>Action</th>}</tr></thead>
              <tbody>{leaveRequests.map((request) => <tr key={request.id}><td>{request.employeeName}<br /><small>{request.employeeCode}</small></td><td>{request.type}</td><td>{request.from}<br /><small>to {request.to}</small></td><td>{request.reason}</td><td><span className={request.status === "Approved" ? "active-chip" : request.status === "Rejected" ? "danger-chip" : "attendance-open-chip"}>{request.status}</span></td>{canManageAttendance && <td>{request.status === "Pending" && <div className="leave-review-actions"><button onClick={() => updateLeaveStatus(request.id, "Approved")}>Approve</button><button className="danger-action" onClick={() => updateLeaveStatus(request.id, "Rejected")}>Reject</button></div>}</td>}</tr>)}</tbody>
            </table>
            {!leaveRequests.length && <div className="empty-table-state">No leave requests for this branch yet.</div>}
          </div>
        </div>
      )}

      {activeTab === "Payroll Summary" && (
        <div className="payroll-summary-stack">
        <div className="panel table-panel">
          <PanelHead title="Payroll attendance summary" icon={FileDown} actions={["Export CSV"]} onAction={() => {
            downloadCsv(`vestora-payroll-attendance-${reportMonth}.csv`, ["employee", "code", "presentDays", "absentDays", "halfDays", "lateCount", "overtimeHours", "payableDays", "monthlySalary", "overtimeRate", "overtimePay", "payableSalary"], payrollRows);
            notify("Payroll summary exported");
          }} />
          <div className="attendance-filter-row payroll-summary-filter">
            <label>Payroll month<input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} /></label>
            <span className="active-chip">{payrollDaysInPeriod} days in period</span>
            {canManageAttendance && <button className="payroll-rate-toggle" onClick={() => setPayrollRatesOpen((current) => !current)}>{payrollRatesOpen ? "Close pay setup" : "Set pay rates"}</button>}
          </div>
          {payrollRatesOpen && canManageAttendance && <div className="payroll-rate-setup">
            <div className="payroll-rate-setup-head"><div><span className="attendance-kiosk-eyebrow">Employee pay setup</span><h3>Salary and overtime rates</h3><p>Enter each employee's monthly salary and overtime payment for one hour.</p></div><button onClick={() => { setPayrollRatesOpen(false); notify("Employee pay rates saved"); }}>Save pay rates</button></div>
            <div className="payroll-rate-list">
              {employees.map((employee) => <div className="payroll-rate-row" key={employee.id}>
                <div><strong>{employee.name}</strong><small>{employee.code} · {employee.designation}</small></div>
                <label>Monthly salary<input type="number" min="0" step="1" value={employee.salary || ""} placeholder="0" onChange={(event) => updateEmployeePayroll(employee.id, "salary", event.target.value)} /></label>
                <label>Overtime per hour<input type="number" min="0" step="1" value={employee.overtimeRate || ""} placeholder="0" onChange={(event) => updateEmployeePayroll(employee.id, "overtimeRate", event.target.value)} /></label>
              </div>)}
            </div>
          </div>}
          <table>
            <thead><tr><th>Employee</th><th>Present</th><th>Absent</th><th>Half days</th><th>Late</th><th>Overtime</th><th>Payable days</th><th>Monthly salary</th><th>OT rate / hour</th><th>OT pay</th><th>Payable salary</th></tr></thead>
            <tbody>{payrollRows.map((row) => (
              <tr key={row.code}><td>{row.employee}<br /><small>{row.code}</small></td><td>{row.presentDays}</td><td>{row.absentDays}</td><td>{row.halfDays}</td><td>{row.lateCount}</td><td>{row.overtimeHours} h</td><td>{row.payableDays}</td><td>₹{row.monthlySalary.toLocaleString("en-IN")}</td><td>₹{row.overtimeRate.toLocaleString("en-IN")}</td><td>₹{row.overtimePay.toLocaleString("en-IN")}</td><td><strong>₹{row.payableSalary.toLocaleString("en-IN")}</strong></td></tr>
            ))}</tbody>
          </table>
        </div>
        </div>
      )}

      {activeTab === "Settings" && (
        <div className="panel attendance-settings-panel">
          <PanelHead title="Attendance settings" icon={SlidersHorizontal} actions={["Save"]} onAction={() => notify("Attendance settings saved")} />
          <div className="menu-form-grid">
            <label>Confidence threshold<input type="number" min="30" max="95" value={settings.confidenceThreshold} onChange={(event) => updateSetting("confidenceThreshold", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Shift start<input type="time" value={settings.shiftStart} onChange={(event) => updateSetting("shiftStart", event.target.value)} disabled={!canManageAttendance} /></label>
            <label>Full day hours<input type="number" min="1" max="16" value={settings.fullDayHours} onChange={(event) => updateSetting("fullDayHours", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Half day hours<input type="number" min="1" max="12" value={settings.halfDayHours} onChange={(event) => updateSetting("halfDayHours", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Overtime after hours<input type="number" min="1" max="16" value={settings.overtimeAfter} onChange={(event) => updateSetting("overtimeAfter", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Device ID<input value={settings.deviceId} onChange={(event) => updateSetting("deviceId", event.target.value)} disabled={!canManageAttendance} /></label>
          </div>
          <label className="attendance-consent"><input type="checkbox" checked={settings.storeFaceImages} onChange={(event) => updateSetting("storeFaceImages", event.target.checked)} disabled={!canManageAttendance} /> Allow storing raw face images for this store.</label>
          <div className="attendance-setup-note">
            <strong>Local face-api setup</strong>
            <span>Place the tiny face detector, landmark, and recognition model files inside frontend/public/models/face-api. The app loads them locally and never sends camera frames to any paid or third-party API.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsView({ notify, billTemplate, setBillTemplate, kotPrinter, setKotPrinter, canManage, canManageAll, activeStore, setStores, themeConfig, setThemeConfig, setDark }) {
  const sectionNames = canManageAll ? Object.keys(settingsSectionConfig) : storeSettingsSections;
  const [selectedSetting, setSelectedSetting] = useState(null);
  const settingMeta = {
    "Restaurant profile": Building2,
    "Branch settings": Store,
    "GST and FSSAI": Percent,
    "Print bill format": ReceiptText,
    "Printer setup": Printer,
    "Payment providers": CreditCard,
    "Cloudflare R2": DatabaseZap,
    "WhatsApp templates": Bell,
    "Backup policy": DatabaseZap,
    "Theme and language": Sun,
  };

  if (selectedSetting === "KOT printer connection") {
    return (
      <section className="screen settings-detail-screen">
        <button className="settings-back-button" onClick={() => setSelectedSetting(null)}><PanelLeftClose size={17} /> Back to settings</button>
        <div className="panel settings-detail-panel">
          <PanelHead title="KOT printer connection" icon={Printer} actions={canManage ? ["Save"] : []} onAction={() => notify("KOT printer settings saved")} />
          <p className="settings-description">Connect and test the kitchen printer used for KOT tickets.</p>
          <KotPrinterSetup kotPrinter={kotPrinter} setKotPrinter={setKotPrinter} notify={notify} canManage={canManage} />
        </div>
      </section>
    );
  }

  if (selectedSetting) {
    return <SettingsManagement notify={notify} canManage={canManage} activeStore={activeStore} setStores={setStores} billTemplate={billTemplate} setBillTemplate={setBillTemplate} kotPrinter={kotPrinter} setKotPrinter={setKotPrinter} themeConfig={themeConfig} setThemeConfig={setThemeConfig} setDark={setDark} activeSection={selectedSetting} onBack={() => setSelectedSetting(null)} />;
  }

  return (
    <section className="screen settings-home">
      <div className="settings-home-head">
        <div>
          <span>Configuration centre</span>
          <h2>Settings</h2>
          <p>Choose a section to view or update its details.</p>
        </div>
        <span className="settings-location">{activeStore?.name || "VESTORA"} / {activeStore?.branch || "All stores"}</span>
      </div>
      <div className="settings-card-grid">
        {sectionNames.map((name) => {
          const Icon = settingMeta[name] || Settings;
          return (
            <button key={name} className="settings-card" onClick={() => setSelectedSetting(name)}>
              <span className="settings-card-icon"><Icon size={21} /></span>
              <span className="settings-card-copy">
                <strong>{name}</strong>
                <small>{settingsSectionConfig[name].description}</small>
              </span>
              <span className="settings-card-open">Open <ChevronRight size={17} /></span>
            </button>
          );
        })}
        <button className="settings-card" onClick={() => setSelectedSetting("KOT printer connection")}>
          <span className="settings-card-icon"><ChefHat size={21} /></span>
          <span className="settings-card-copy">
            <strong>KOT printer connection</strong>
            <small>Connect, test, and manage the kitchen ticket printer.</small>
          </span>
          <span className="settings-card-open">Open <ChevronRight size={17} /></span>
        </button>
      </div>
    </section>
  );
}

function DataModule({ title, icon: Icon, rows, notify, canManageAll }) {
  const [selected, setSelected] = useState(rows[0]);
  const [records, setRecords] = useState(rows);
  const [editName, setEditName] = useState(rows[0]);
  function action(type) {
    if (type === "New") {
      if (!canManageAll) {
        notify("Admin permission required to create records");
        return;
      }
      const name = `New ${title} item ${records.length + 1}`;
      setRecords((current) => [...current, name]);
      setSelected(name);
      setEditName(name);
      notify(`${name} created`);
    } else {
      notify(`${title} ${type.toLowerCase()} ready`);
    }
  }

  function openRecord(row) {
    setSelected(row);
    setEditName(row);
    notify(`${row} opened`);
  }

  function saveRecord() {
    if (!canManageAll) {
      notify("Admin permission required to edit records");
      return;
    }
    if (!editName.trim()) {
      notify("Enter a record name");
      return;
    }
    setRecords((current) => current.map((row) => row === selected ? editName.trim() : row));
    setSelected(editName.trim());
    notify(`${editName.trim()} saved`);
  }

  function deleteRecord() {
    if (!canManageAll) {
      notify("Admin permission required to delete records");
      return;
    }
    setRecords((current) => {
      const next = current.filter((row) => row !== selected);
      const nextSelected = next[0] || "";
      setSelected(nextSelected);
      setEditName(nextSelected);
      return next;
    });
    notify(`${selected} deleted`);
  }

  return (
    <section className="screen">
      <div className="panel">
        <PanelHead title={title} icon={Icon} actions={["New", "Import", "Export"]} onAction={action} />
        <div className="module-layout">
          <div className="module-list">{records.map((row, index) => <button key={`${row}-${index}`} className={selected === row ? "active-module" : ""} onClick={() => openRecord(row)}><span>{row}</span><strong>Open</strong></button>)}</div>
          <div className="detail-panel">
            <h2>{selected || "No record selected"}</h2>
            <p>Status: Active</p>
            <p>Last update: Just now</p>
            {canManageAll ? (
              <>
                <label>Record name<input value={editName} onChange={(event) => setEditName(event.target.value)} disabled={!selected} /></label>
                <div className="row-actions">
                  <button onClick={saveRecord} disabled={!selected}>Save changes</button>
                  <button onClick={deleteRecord} disabled={!selected}>Delete</button>
                </div>
              </>
            ) : <p className="permission-note">View only. Admin permission is required to edit or delete this record.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function DataTable({ title, icon, columns, rows, notify, canManageAll, allowAdd = false, addLabel = "Add item", addRowDefaults = [], emptyMessage = "No records found" }) {
  const Icon = icon;
  const [filterOn, setFilterOn] = useState(false);
  const [tableRows, setTableRows] = useState(rows);
  const [editingIndex, setEditingIndex] = useState(null);
  const [rowDraft, setRowDraft] = useState([]);
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState(addRowDefaults.length ? addRowDefaults : columns.map(() => ""));
  const visibleRows = filterOn ? tableRows.filter((row) => ["Low", "Review"].includes(row[row.length - 1])) : tableRows;

  function startEdit(row) {
    if (!canManageAll) {
      notify("Admin permission required to edit table rows");
      return;
    }
    setEditingIndex(tableRows.indexOf(row));
    setRowDraft([...row]);
    notify(`${row[0]} ready to edit`);
  }

  function saveRow() {
    if (editingIndex === null) return;
    setTableRows((current) => current.map((row, index) => index === editingIndex ? rowDraft : row));
    notify(`${rowDraft[0]} updated`);
    setEditingIndex(null);
    setRowDraft([]);
  }

  function deleteRow(row) {
    if (!canManageAll) {
      notify("Admin permission required to delete table rows");
      return;
    }
    setTableRows((current) => current.filter((currentRow) => currentRow !== row));
    notify(`${row[0]} deleted`);
  }

  function openNewRow() {
    if (!canManageAll) {
      notify("Admin permission required to add a new item");
      return;
    }
    setNewRow(addRowDefaults.length ? [...addRowDefaults] : columns.map(() => ""));
    setAddingRow(true);
  }

  function saveNewRow() {
    if (newRow.some((value) => !String(value).trim())) {
      notify("Complete all expense details before saving");
      return;
    }
    setTableRows((current) => [...current, newRow]);
    setAddingRow(false);
    notify(`${newRow[0]} added to ${title}`);
  }

  return (
    <section className="screen">
      <div className="panel table-panel">
        <PanelHead title={title} icon={Icon} actions={[...(allowAdd ? [addLabel] : []), "Filter", "Date range", "Export"]} activeAction={filterOn ? "Filter" : ""} onAction={(action) => { if (action === addLabel && allowAdd) { openNewRow(); return; } if (action === "Filter") setFilterOn((value) => !value); notify(`${title} ${action.toLowerCase()} clicked`); }} />
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{canManageAll && <th>Actions</th>}</tr></thead>
          <tbody>
            {addingRow && (
              <tr className="table-add-row">
                {columns.map((column, index) => <td key={column}><input className="table-edit-input" value={newRow[index] || ""} onChange={(event) => setNewRow((current) => current.map((value, cellIndex) => cellIndex === index ? event.target.value : value))} placeholder={column} /></td>)}
                {canManageAll && <td><div className="row-actions"><button type="button" onClick={saveNewRow}>Save</button><button type="button" onClick={() => setAddingRow(false)}>Cancel</button></div></td>}
              </tr>
            )}
            {visibleRows.length === 0 && <tr><td className="table-empty-state" colSpan={columns.length + (canManageAll ? 1 : 0)}>{emptyMessage}</td></tr>}
            {visibleRows.map((row) => {
            const sourceIndex = tableRows.indexOf(row);
            const isEditing = editingIndex === sourceIndex;
            return (
              <tr key={`${row.join("-")}-${sourceIndex}`} onClick={() => notify(`${row[0]} selected`)}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>
                    {isEditing ? <input className="table-edit-input" value={rowDraft[cellIndex]} onChange={(event) => setRowDraft((current) => current.map((value, index) => index === cellIndex ? event.target.value : value))} /> : cell}
                  </td>
                ))}
                {canManageAll && (
                  <td>
                    <div className="row-actions">
                      {isEditing ? <button onClick={(event) => { event.stopPropagation(); saveRow(); }}>Save</button> : <button onClick={(event) => { event.stopPropagation(); startEdit(row); }}>Edit</button>}
                      <button onClick={(event) => { event.stopPropagation(); deleteRow(row); }}>Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Insight({ title, text }) {
  return <div className="insight"><strong>{title}</strong><span>{text}</span></div>;
}

function Metric({ icon: Icon, label, value, trend, danger }) {
  return <div className={danger ? "metric danger" : "metric"}><Icon size={20} /><span>{label}</span><strong>{value}</strong>{trend && <em>{trend}</em>}</div>;
}

function PanelHead({ title, icon: Icon, actions = [], onAction, activeAction }) {
  return (
    <div className="panel-head">
      <div><Icon size={19} /><h2>{title}</h2></div>
      <div className="head-actions">{actions.map((action) => <button key={action} className={activeAction === action ? "active-action" : ""} onClick={() => onAction?.(action)}>{action}</button>)}</div>
    </div>
  );
}

function StatusBoard({ title, data, money, percent }) {
  return <div className="panel"><h2>{title}</h2><div className="status-list">{data.map(([label, value]) => <div key={label}><span>{label}</span><strong>{money ? formatMoney(value) : percent ? `${value}%` : value}</strong></div>)}</div></div>;
}

createRoot(document.getElementById("root")).render(<App />);
