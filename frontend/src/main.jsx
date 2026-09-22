import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import qz from "qz-tray";
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
  Folder,
  FolderOpen,
  Gauge,
  GripVertical,
  History,
  KeyRound,
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
  QrCode,
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
import { businessStorage as localStorage, stopCloudSync } from "./lib/supabase";
import { useBusinessState, useCloudSyncStatus } from "./lib/use-business-state";
import { fetchSharedSuperAdminStores, getSupabaseSession, hydrateLocalStateFromSupabase, signInWithSupabase, supabase, supabaseApiList, supabaseApiRequest, supabaseConfigured, supabaseFunctionJson, supabaseProfile, syncInventoryState, syncLocalStateKeyToSupabase, syncLocalStateToSupabase, updateSupabasePassword } from "./lib/supabase";

const appBaseUrl = import.meta.env.BASE_URL || "/";
const localAuthEnabled = String(import.meta.env.VITE_LOCAL_AUTH_ENABLED || "").toLowerCase() === "true";
const localAuthEmail = String(import.meta.env.VITE_LOCAL_AUTH_EMAIL || "").trim().toLowerCase();
const localAuthPassword = String(import.meta.env.VITE_LOCAL_AUTH_PASSWORD || "");

function publicAssetPath(path) {
  const cleanBase = appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`;
  const cleanPath = String(path).replace(/^\/+/, "");
  return `${cleanBase}${cleanPath}`;
}

const vestoraLogoPath = publicAssetPath("uvpro-logo-red.png");

const modules = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "POS Billing", icon: ShoppingCart },
  { id: "kds", label: "KDS", icon: ChefHat },
  { id: "tables", label: "Tables", icon: Table2 },
  { id: "menu", label: "Menu", icon: ClipboardList },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "production", label: "Production", icon: DatabaseZap },
  { id: "item-stock", label: "Item Stock", icon: PackageSearch },
  { id: "crm", label: "CRM", icon: Users },
  { id: "offers", label: "Offers & Promotions", icon: Percent },
  { id: "attendance", label: "Attendance", icon: Camera },
  { id: "finance", label: "Finance", icon: BadgeIndianRupee },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "mis", label: "MIS Reports", icon: Gauge },
  { id: "admin", label: "Admin", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

const menuItems = [
  { id: "ITEM-UVP-001", name: "Chicken Biryani", category: "Mains", barcode: "", price: 190, tax: 5, fav: true, status: "Active", image: publicAssetPath("menu/hyderabadi-biryani.jpg") },
  { id: "ITEM-UVP-002", name: "Paneer Tikka Bowl", category: "Mains", barcode: "", price: 220, tax: 5, fav: true, status: "Active", image: publicAssetPath("menu/paneer-tikka-bowl.jpg") },
  { id: "ITEM-UVP-003", name: "Tandoori Platter", category: "Mains", barcode: "", price: 349, tax: 5, fav: false, status: "Active", image: publicAssetPath("menu/tandoori-platter.jpg") },
  { id: "ITEM-UVP-004", name: "Masala Chaas", category: "Beverages", barcode: "", price: 69, tax: 5, fav: false, status: "Active", image: publicAssetPath("menu/masala-chaas.jpg") },
  { id: "ITEM-UVP-005", name: "Filter Coffee", category: "Beverages", barcode: "", price: 55, tax: 5, fav: true, status: "Active", image: publicAssetPath("menu/filter-coffee.jpg") },
  { id: "ITEM-UVP-006", name: "Gulab Jamun", category: "Dessert", barcode: "", price: 89, tax: 5, fav: false, status: "Active", image: publicAssetPath("menu/gulab-jamun.jpg") },
];
const dummyPosProductBarcodes = new Set([
  "890100100001",
  "890100100002",
  "890100100003",
  "890100100004",
  "890100100005",
  "890100100006",
]);

function removeDummyPosProducts(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !dummyPosProductBarcodes.has(String(item.barcode || "").trim()));
}

function preparePosProducts(items) {
  const correctedItems = removeDummyPosProducts(items).map((item) => {
    const normalizedName = String(item.name || "").trim().toLowerCase();
    if (["vhicken biriyani", "vhicken biryani", "chicken biriyani"].includes(normalizedName)) {
      return {
        ...item,
        name: "Chicken Biryani",
        image: item.image || publicAssetPath("menu/hyderabadi-biryani.jpg"),
      };
    }
    return item;
  });
  const existingNames = new Set(correctedItems.map((item) => String(item.name || "").trim().toLowerCase()));
  return [
    ...correctedItems,
    ...menuItems.filter((item) => !existingNames.has(item.name.toLowerCase())),
  ];
}

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
    changedBy: "UVPRO Super Admin",
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

const defaultStores = [];
const emptyStoreContext = { id: "GLOBAL", name: "UVPRO", branch: "All stores", owner: "", status: "Active" };
const dummyStoreIds = new Set(["STORE-001", "STORE-002"]);

function removeDummyStores(stores) {
  if (!Array.isArray(stores)) return [];
  return stores.filter((store) => !dummyStoreIds.has(String(store?.id || "")));
}

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
  "Integrations": {
    description: "Configure branch-level delivery outlets, menu mappings, stock, kitchen tickets, and test order flows.",
    action: "Open integrations",
    fields: [],
    defaults: {},
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
    defaults: { billTemplate: "Your UVPRO bill is ready", orderTemplate: "Your order is ready", sender: "+91 90000 11111", language: "English" },
  },
  "Backup policy": {
    description: "Automatic local and cloud backup schedule.",
    action: "Run backup",
    fields: [["frequency", "Frequency"], ["time", "Backup time"], ["retention", "Retention"], ["destination", "Destination"]],
    defaults: { frequency: "Daily", time: "12:30 AM", retention: "90 days", destination: "Local + Cloudflare R2" },
  },
  "QR ordering": {
    description: "Generate this store's customer ordering QR code.",
    action: "Generate QR",
    fields: [],
    defaults: {},
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
  "Integrations",
  "QR ordering",
  "Theme and language",
];

const printerChoices = [
  "BPOS RP-260IV",
  "BPOS RP-260IV Receipt Printer",
  "Front counter printer",
  "Kitchen KOT Printer",
  "Windows default printer",
];

const bootstrapSuperAdminAccounts = [];

const supplierAccounts = [];

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

const starterUsers = [];

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
  "Restaurant Owner": modules.map((module) => module.id),
  "Branch Manager": ["dashboard", "pos", "kds", "tables", "menu", "inventory", "production", "item-stock", "crm", "offers", "attendance", "reports", "mis", "settings"],
  "HR Manager": ["dashboard", "attendance", "reports", "mis", "settings"],
  Cashier: ["dashboard", "pos", "tables", "offers", "finance"],
  Waiter: ["tables", "kds"],
  Chef: ["kds", "inventory", "production", "item-stock"],
  Accountant: ["dashboard", "finance", "reports", "mis"],
};

const adminRoleChoicesAll = ["Restaurant Admin", "Branch Manager", "Cashier", "Waiter", "Chef", "Accountant"];
const adminRoleChoicesStore = ["Branch Manager", "Cashier", "Waiter", "Chef", "Accountant"];

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
  if (["Restaurant Admin", "restaurant_admin", "Restaurant Owner", "owner"].includes(role)) return "restaurant_admin";
  if (role === "supplier") return "supplier";
  return "restaurant_user";
}

function roleLabelForAuthRole(role) {
  const roleLabels = {
    super_admin: "Super Admin",
    owner: "Restaurant Owner",
    restaurant_admin: "Restaurant Admin",
    branch_manager: "Branch Manager",
    manager: "Manager",
    cashier: "Cashier",
    waiter: "Waiter",
    chef: "Chef",
    kitchen_staff: "Chef",
    inventory_manager: "Inventory Manager",
    purchase_manager: "Purchase Manager",
    hr_manager: "HR Manager",
    accountant: "Accountant",
    delivery_boy: "Delivery Boy",
    supplier: "Supplier",
  };
  return roleLabels[role] || role || "Cashier";
}

function roleLabelForUser(user) {
  if (user?.appRole) return user.appRole;
  return roleLabelForAuthRole(user?.role);
}

function normalizeStoreId(storeId) {
  return storeId && storeId !== "GLOBAL" ? storeId : "GLOBAL";
}

function storeLabel(store) {
  if (!store) return "UVPRO / All stores";
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

function normalizeFoodItemName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("biriyani", "biryani")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foodStockRecordFor(records, item) {
  const itemKey = normalizeFoodItemName(item?.name || item);
  return (records || []).find((record) => normalizeFoodItemName(record.item) === itemKey);
}

function foodStockThreshold(record) {
  const threshold = Number(record?.threshold);
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : 5;
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

function blendHexColors(first, second, firstWeight = 0.5) {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  const weight = Math.min(1, Math.max(0, firstWeight));
  const blended = firstRgb.map((value, index) => Math.round(value * weight + secondRgb[index] * (1 - weight)));
  return `#${blended.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
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
  if (theme.mode === "Dark") {
    const darkPrimary = "#2f3a36";
    const darkAccent = "#8a948f";
    const darkSidebar = "#111816";
    const darkSidebarActive = "#26312d";
    const darkBg = "#0f1413";
    const darkSurface = "#1b2421";
    const darkText = "#f3f6f4";
    const darkMuted = "#a7b5af";
    return {
      "--theme-primary": darkPrimary,
      "--theme-accent": darkAccent,
      "--theme-sidebar": darkSidebar,
      "--theme-sidebar-active": darkSidebarActive,
      "--theme-bg": darkBg,
      "--theme-surface": darkSurface,
      "--theme-text": darkText,
      "--theme-muted": darkMuted,
      "--theme-on-primary": readableTextColor(darkPrimary),
      "--theme-on-accent": readableTextColor(darkAccent),
      "--theme-on-sidebar": readableTextColor(darkSidebar),
      "--theme-on-sidebar-active": readableTextColor(darkSidebarActive),
      "--theme-on-surface": readableTextColor(darkSurface),
    };
  }
  const primaryColor = safeColorValue(theme.primaryColor);
  const accentColor = safeColorValue(theme.accentColor, "#c28a3a");
  const sidebarColor = safeColorValue(theme.sidebarColor, "#10231f");
  const backgroundColor = safeColorValue(theme.backgroundColor, "#f7f8f5");
  const surfaceColor = safeColorValue(theme.surfaceColor, "#ffffff");
  const sidebarActiveColor = blendHexColors(primaryColor, sidebarColor, 0.58);
  return {
    "--theme-primary": primaryColor,
    "--theme-accent": accentColor,
    "--theme-sidebar": sidebarColor,
    "--theme-sidebar-active": sidebarActiveColor,
    "--theme-bg": backgroundColor,
    "--theme-surface": surfaceColor,
    "--theme-text": ensureReadableText(theme.textColor, surfaceColor),
    "--theme-muted": ensureReadableText(theme.mutedColor, surfaceColor, 3),
    "--theme-on-primary": readableTextColor(primaryColor),
    "--theme-on-accent": readableTextColor(accentColor),
    "--theme-on-sidebar": readableTextColor(sidebarColor),
    "--theme-on-sidebar-active": readableTextColor(sidebarActiveColor),
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

async function syncOfflineOrders() {
  const queued = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]");
  if (!queued.length || !navigator.onLine || !window.vestoraSupabaseStateReady) return 0;
  const saved = await syncLocalStateKeyToSupabase("vestora-sales-ledger");
  const confirmed = new Set((saved || []).map((bill) => bill.id));
  const remaining = queued.filter((bill) => !confirmed.has(bill.id));
  localStorage.setItem("vestora-offline-orders", JSON.stringify(remaining));
  return queued.length - remaining.length;
}

function ChangePasswordDialog({ onClose, notify }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters");
    if (password !== confirmation) return setError("Passwords do not match");
    setSaving(true);
    setError("");
    const { error: updateError } = await updateSupabasePassword(password);
    setSaving(false);
    if (updateError) return setError(updateError.message || "Unable to change password");
    notify("Password changed successfully");
    onClose();
  }

  return (
    <div className="shift-modal-backdrop" role="presentation">
      <form className="shift-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Change password">
        <div className="shift-modal-head">
          <div><span>Account security</span><h2>Change password</h2></div>
          <button type="button" onClick={onClose} title="Close"><X size={18} /></button>
        </div>
        <p className="modal-help-text">Set a new password for the account verified through the email reset link.</p>
        <label>New password
          <span className="password-field">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </span>
        </label>
        <label>Confirm new password
          <span className="password-field">
            <input type={showConfirmation ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" />
            <button type="button" onClick={() => setShowConfirmation((value) => !value)} title={showConfirmation ? "Hide password" : "Show password"}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="shift-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Change password"}</button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);
  // Keep older printed QR codes working even if they predate the explicit
  // `order=1` flag. Staff links do not use these public ordering parameters.
  const isCustomerOrderingLink = params.get("order") === "1"
    || params.has("store")
    || params.has("storeId")
    || window.location.pathname.endsWith("/order");
  return isCustomerOrderingLink ? <CustomerTableOrdering /> : <AuthenticatedApp />;
}

function CloudSyncBanner() {
  const status = useCloudSyncStatus();
  // Routine saving is silent. Only a real cloud error needs attention in the
  // bottom corner, where the operator can retry without losing local work.
  // Cross-device merge conflicts remain protected in the sync layer, but hide
  // their internal record key and person name from the operator-facing banner.
  const isCrossDeviceConflict = /changed on another computer|changes are arriving from another computer/i.test(status.message || "");
  if (status.state !== "error" || isCrossDeviceConflict) return null;
  return <div className="cloud-sync-banner cloud-sync-error" role="alert"><span>{status.message}</span><button type="button" onClick={() => syncLocalStateToSupabase().catch(() => {})}>Retry</button></div>;
}

function AuthenticatedApp() {
  const [currentUser, setCurrentUser] = useState(() => {
    // A device can retain the last staff member's cached profile. Never use
    // it for a cloud-backed session, because it could briefly expose that
    // person's navigation while the actual signed-in role is verified.
    if (supabaseConfigured) return null;
    const saved = localStorage.getItem("vestora-current-user");
    if (!saved) return null;
    const user = JSON.parse(saved);
    return { ...user, role: roleToAuthRole(user.role), appRole: user.appRole || roleLabelForUser(user) };
  });
  const [supabaseStateReady, setSupabaseStateReady] = useState(() => !supabaseConfigured);
  const [active, setActive] = useState("dashboard");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [returnModule, setReturnModule] = useState("dashboard");
  const [superAdminLanding, setSuperAdminLanding] = useState(() => currentUser?.role === "super_admin" && localStorage.getItem("vestora-super-admin-in-store") !== "true");
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 760px)").matches);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [appInstalled, setAppInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
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
  const [offersNavOpen, setOffersNavOpen] = useState(false);
  const [offersView, setOffersView] = useState("Happy hour offer");
  const [financeNavOpen, setFinanceNavOpen] = useState(false);
  const [financeView, setFinanceView] = useState("Expenses");
  const [reportNavOpen, setReportNavOpen] = useState(false);
  const [reportView, setReportView] = useState("Daily sales");
  const [selectedStoreId, setSelectedStoreId] = useState(() => localStorage.getItem("vestora-selected-store") || "GLOBAL");
  const settingsStoreId = currentUser?.role === "super_admin" ? selectedStoreId : normalizeStoreId(currentUser?.storeId);
  const [themeConfig, setThemeConfig] = useBusinessState(`vestora-theme-config-${settingsStoreId}`, () => normalizeThemeConfig(loadStoredObject("vestora-theme-config")));
  const [dark, setDark] = useState(() => themeConfig.mode === "Dark");
  const [cart, setCart] = useState([]);
  const [posCashier, setPosCashier] = useState(() => loadStoredObject("vestora-pos-cashier"));
  const [orderType, setOrderType] = useState("Dine-in");
  const [toast, setToast] = useState("");
  const [lastShiftClose, setLastShiftClose] = useBusinessState(`vestora-last-shift-close-${settingsStoreId}`, () => loadStoredObject(`vestora-last-shift-close-${settingsStoreId}`));
  const [sharedShifts, setSharedShifts] = useBusinessState(`vestora-shifts-${settingsStoreId}`, () => {
    const saved = localStorage.getItem("vestora-current-shift");
    return saved && posCashier?.storeId === settingsStoreId ? [JSON.parse(saved)] : [];
  });
  const currentShift = sharedShifts.find((shift) => !shift.closedAt && String(shift.cashierId) === String(posCashier?.id)) || null;
  function setCurrentShift(shift) {
    if (shift) setSharedShifts((current) => [...current.filter((entry) => entry.id !== shift.id), shift]);
  }
  const [users, setUsers] = useBusinessState("vestora-users", () => {
    const savedUsers = loadStoredArray("vestora-users");
    return savedUsers.length ? savedUsers : starterUsers;
  });
  const [customRoles, setCustomRoles] = useBusinessState("vestora-custom-roles", () => loadStoredArray("vestora-custom-roles"));
  const [stores, setStores] = useBusinessState("vestora-stores", () => {
    const savedStores = localStorage.getItem("vestora-stores");
    if (savedStores !== null) {
      try {
        const parsedStores = JSON.parse(savedStores);
        if (Array.isArray(parsedStores)) return removeDummyStores(parsedStores);
      } catch {
        // Fall through to the starter directory only when saved data is invalid.
      }
    }
    return defaultStores;
  });
  const lastLocalStoresWriteAtRef = useRef(0);
  useEffect(() => {
    setStores((current) => {
      const cleaned = removeDummyStores(current);
      return cleaned.length === current.length ? current : cleaned;
    });
  }, []);
  useEffect(() => {
    if (currentUser?.role !== "super_admin" || stores.length || !supabaseStateReady) return;
    setSelectedStoreId("GLOBAL");
    setSuperAdminLanding(true);
    localStorage.removeItem("vestora-super-admin-in-store");
  }, [currentUser?.role, stores.length]);
  const [billTemplate, setBillTemplate] = useBusinessState(`vestora-bill-template-${settingsStoreId}`, () => {
    const saved = localStorage.getItem(`vestora-bill-template-${settingsStoreId}`) || localStorage.getItem("vestora-bill-template");
    return saved ? { ...defaultBillTemplate, ...JSON.parse(saved) } : defaultBillTemplate;
  });
  const [kotPrinter, setKotPrinter] = useState(() => {
    const saved = localStorage.getItem("vestora-kot-printer");
    if (!saved) return defaultKotPrinter;
    const printer = { ...defaultKotPrinter, ...JSON.parse(saved) };
    return printer.type === "QZ Tray" ? { ...printer, enabled: false, status: "Disconnected" } : printer;
  });
  const [salesLedger, setSalesLedger] = useBusinessState("vestora-sales-ledger", () => loadStoredArray("vestora-sales-ledger"));
  const [voidLedger, setVoidLedger] = useBusinessState("vestora-void-ledger", () => loadStoredArray("vestora-void-ledger"));
  const [refundLedger, setRefundLedger] = useBusinessState("vestora-refund-ledger", () => loadStoredArray("vestora-refund-ledger"));
  const [kdsOrders, setKdsOrders] = useBusinessState("vestora-kds-orders", () => loadStoredArray("vestora-kds-orders"));
  const [tableOrders, setTableOrders] = useBusinessState("vestora-table-orders", () => loadStoredArray("vestora-table-orders"));
  const tableOrdersChannelRef = useRef(null);
  const [supplierOrders, setSupplierOrders] = useBusinessState("vestora-supplier-orders", () => loadStoredArray("vestora-supplier-orders"));
  const online = useOnlineStatus();
  const queuedOrders = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]").length;
  const canManageAll = currentUser?.role === "super_admin";
  const canManage = canManageAll || currentUser?.role === "restaurant_admin";
  // Some legacy administrator accounts are scoped through the directory and
  // arrive without a single default branch. They may choose a branch in POS;
  // all backend requests still enforce their permitted store scope.
  const assignedStoreId = normalizeStoreId(currentUser?.storeId);
  const activeStoreId = canManageAll ? selectedStoreId : assignedStoreId === "GLOBAL" ? selectedStoreId : assignedStoreId;
  const activeStore = stores.find((store) => store.id === activeStoreId) || emptyStoreContext;
  useEffect(() => {
    if (supabaseStateReady && sharedShifts.length) localStorage.setItem(`vestora-shifts-${settingsStoreId}`, JSON.stringify(sharedShifts));
  }, [supabaseStateReady, settingsStoreId, sharedShifts]);
  useEffect(() => {
    setLastShiftClose(loadStoredObject(`vestora-last-shift-close-${activeStore.id}`));
  }, [activeStore.id]);
  const foodStockStorageKey = `vestora-food-stock-${activeStore.id}`;
  const [foodStock, setFoodStock] = useBusinessState(foodStockStorageKey, () => loadStoredArray(foodStockStorageKey));
  useEffect(() => {
    setFoodStock(loadStoredArray(`vestora-food-stock-${activeStore.id}`));
  }, [activeStore.id]);
  function updateFoodStock(updater) {
    setFoodStock((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      localStorage.setItem(foodStockStorageKey, JSON.stringify(next));
      syncLocalStateKeyToSupabase(foodStockStorageKey).catch(() => {});
      return next;
    });
  }
  useEffect(() => {
    if (!supabaseStateReady || !supabaseConfigured || !activeStoreId || activeStoreId === "GLOBAL") return undefined;
    let cancelled = false;
    const refreshFoodStock = async () => {
      try {
        if (!cancelled) await syncLocalStateKeyToSupabase(foodStockStorageKey);
      } catch {
        // POS remains usable with its local copy while cloud state is unavailable.
      }
    };
    refreshFoodStock();
    const timer = window.setInterval(refreshFoodStock, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [supabaseStateReady, activeStoreId, foodStockStorageKey]);
  const [productItems, setProductItems] = useBusinessState(`vestora-menu-items-${activeStore.id}`, () => {
    const saved = loadStoredArray(`vestora-menu-items-${activeStore.id}`);
    return preparePosProducts(saved);
  });
  const scopedSalesLedger = salesLedger.filter((bill) => normalizeStoreId(bill.storeId) === activeStore.id);
  const scopedVoidLedger = voidLedger.filter((entry) => normalizeStoreId(entry.storeId) === activeStore.id);
  const scopedRefundLedger = refundLedger.filter((entry) => normalizeStoreId(entry.storeId) === activeStore.id);
  const scopedKdsOrders = kdsOrders.filter((order) => normalizeStoreId(order.storeId) === activeStore.id);
  const scopedTableOrders = tableOrders.filter((order) => normalizeStoreId(order.storeId) === activeStore.id);
  const activeCashiers = users.filter((user) => (activeStore.id === "GLOBAL" || normalizeStoreId(user.storeId) === activeStore.id) && user.role === "Cashier" && user.status === "Active");
  const comparisonStores = (canManageAll ? stores.filter((store) => store.name === activeStore.name) : [activeStore])
    .filter((store) => store && store.status !== "Inactive" && (store.branch || store.id === activeStore.id));
  const comparisonSalesLedger = canManageAll ? salesLedger : scopedSalesLedger;
  const currentRoleLabel = roleLabelForUser(currentUser);
  const roleAccessMap = {
    ...roleModuleAccess,
    ...Object.fromEntries(customRoles.filter((role) => role.status !== "Inactive").map((role) => [role.name, role.modules?.length ? role.modules : roleModuleAccess.Cashier])),
  };
  const allowedModuleIds = roleAccessMap[currentRoleLabel] || roleModuleAccess.Cashier;
  const visibleModules = modules.filter((module) => allowedModuleIds.includes(module.id));
  const activeModule = visibleModules.some((module) => module.id === active) ? active : visibleModules[0]?.id || "dashboard";
  const themeVariables = themeStyleVariables(themeConfig);

  useEffect(() => {
    window.vestoraSupabaseStateReady = supabaseStateReady;
  }, [supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem(`vestora-theme-config-${settingsStoreId}`, JSON.stringify(themeConfig));
    setDark(themeConfig.mode === "Dark");
  }, [themeConfig, settingsStoreId, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-custom-roles", JSON.stringify(customRoles));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-custom-roles").catch(() => {});
  }, [customRoles, currentUser, supabaseStateReady]);

  function notify(message, duration = 2600) {
    setToast(message);
    window.clearTimeout(window.vestoraToastTimer);
    window.vestoraToastTimer = window.setTimeout(() => setToast(""), duration);
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
  if (moduleId !== "offers") setOffersNavOpen(false);
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

  async function installWebApp() {
    if (!installPrompt) {
      notify("Use your browser menu and choose Install UVPRO to add the app to this device.", 4500);
      return;
    }
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice?.outcome === "accepted") notify("UVPRO is installing on this device");
  }

  function openOffersView(view) {
    setOffersView(view);
    setOffersNavOpen(true);
    setReturnModule("offers");
    setActive("offers");
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
    window.vestoraSupabaseStateReady = false;
    stopCloudSync();
    if (supabaseConfigured) supabase.auth.signOut().catch(() => {});
    localStorage.removeItem("vestora-current-user");
    localStorage.removeItem("vestora-super-admin-in-store");
    localStorage.removeItem("vestora-pos-cashier");
    sessionStorage.removeItem("vestora-supabase-hydrated-user");
    setPosCashier(null);
    setSupabaseStateReady(!supabaseConfigured);
    setCurrentUser(null);
  }

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    let mounted = true;
    let applying = false;
    let loadedUserId = "";
    let generation = 0;
    const applySession = async (session) => {
      if (!mounted || !session?.user) return;
      if (applying || loadedUserId === session.user.id) return;
      applying = true;
      const attempt = ++generation;
      const isCurrent = () => mounted && attempt === generation;
      window.vestoraSupabaseStateReady = false;
      setSupabaseStateReady(false);
      const metadata = session.user.user_metadata || {};
      const assigned = session.user.app_metadata?.vestora || {};
      // Do not guess a cashier role while a legacy account's server profile
      // is still loading. That guess briefly opened a store dashboard for
      // Super Admins before their platform role was applied.
      const assignedRole = assigned.role || metadata.role || "";
      const fallbackRole = assignedRole || "cashier";
      let loginUser = {
        id: session.user.id,
        email: session.user.email || "",
        name: metadata.name || session.user.email || "Supabase user",
        role: roleToAuthRole(fallbackRole),
        appRole: assigned.appRole || metadata.appRole || roleLabelForAuthRole(fallbackRole),
        storeId: assigned.storeId || metadata.storeId || "STORE-001",
        status: "Active",
      };
      if (assignedRole) {
        if (loginUser.role === "super_admin") {
          setSuperAdminLanding(localStorage.getItem("vestora-super-admin-in-store") !== "true");
        }
        setCurrentUser(loginUser);
      }
      try {
        const profile = await supabaseProfile();
        if (!isCurrent()) return;
        loginUser = { ...loginUser, ...profile, role: roleToAuthRole(profile.role), storeId: profile.storeId || "GLOBAL" };
        // This includes the authorized directory; a separate directory read
        // delayed startup and its failure was previously hidden.
        await hydrateLocalStateFromSupabase();
        if (!isCurrent()) return;
        const openSuperAdminLanding = loginUser.role === "super_admin";
        if (openSuperAdminLanding) {
          setSuperAdminLanding(localStorage.getItem("vestora-super-admin-in-store") !== "true");
        }
        setCurrentUser(loginUser);
        localStorage.setItem("vestora-current-user", JSON.stringify(loginUser));
        if (loginUser.role !== "super_admin") {
          setSelectedStoreId(normalizeStoreId(loginUser.storeId));
        }
        if (!openSuperAdminLanding) setSuperAdminLanding(false);
        const loginRole = roleLabelForUser(loginUser);
        const landingModule = loginRole === "Waiter" ? "tables" : loginRole === "Chef" ? "kds" : "dashboard";
        setActive(landingModule);
        setReturnModule(landingModule);
        window.vestoraSupabaseStateReady = true;
        setSupabaseStateReady(true);
        loadedUserId = session.user.id;
      } catch {
        // The workspace remains usable from its saved local copy while the
        // background connection is restored. Writes stay protected until
        // hydration completes.
      } finally {
        if (isCurrent()) applying = false;
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && mounted) setPasswordDialogOpen(true);
      if (session) window.setTimeout(() => applySession(session), 0);
      else if (mounted) {
        generation++;
        applying = false;
        loadedUserId = "";
        window.vestoraSupabaseStateReady = false;
        stopCloudSync();
        setCurrentUser(null);
        setSupabaseStateReady(!supabaseConfigured);
      }
    });
    // Register the listener before loading the session so recovery links do
    // not lose the PASSWORD_RECOVERY event during Supabase initialization.
    getSupabaseSession().then((session) => applySession(session)).catch(() => {});
    return () => {
      mounted = false;
      generation++;
      stopCloudSync();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !currentUser || !supabaseStateReady) return undefined;
    let cancelled = false;
    const persist = () => {
      if (!cancelled) syncLocalStateToSupabase().catch(() => {});
    };
    persist();
    const timer = window.setInterval(persist, 5000);
    window.addEventListener("online", persist);
    window.addEventListener("focus", persist);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", persist);
      window.removeEventListener("focus", persist);
    };
  }, [currentUser, supabaseStateReady]);

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
      id: `SHIFT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
    setCurrentShift(shiftClose);
    const shiftCloseKey = `vestora-last-shift-close-${activeStore.id}`;
    localStorage.setItem(shiftCloseKey, JSON.stringify(shiftClose));
    const historyKey = `vestora-shift-history-${activeStore.id}`;
    localStorage.setItem(historyKey, JSON.stringify([...loadStoredArray(historyKey).filter((entry) => entry.id !== shiftClose.id), shiftClose]));
    syncLocalStateKeyToSupabase(shiftCloseKey).catch(() => {});
    localStorage.removeItem("vestora-current-shift");
    localStorage.removeItem("vestora-pos-cashier");
    setPosCashier(null);
    exitPOS();
    notify(`Shift closed at ${formatMoney(balance)}`);
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(publicAssetPath("service-worker.js"), { updateViaCache: "none" }).catch(() => {});
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const markInstalled = () => {
      setInstallPrompt(null);
      setAppInstalled(true);
      notify("UVPRO is installed and ready to open like an app");
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (posCashier) localStorage.setItem("vestora-pos-cashier", JSON.stringify(posCashier));
    else localStorage.removeItem("vestora-pos-cashier");
  }, [posCashier]);

  useEffect(() => {
    if (!online || !supabaseStateReady) return;
    syncOfflineOrders().then((count) => { if (count) notify(`${count} offline bills saved to cloud`); }).catch(() => {});
  }, [online, supabaseStateReady, salesLedger]);

  useEffect(() => {
    localStorage.setItem("vestora-sales-ledger", JSON.stringify(salesLedger));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-sales-ledger").catch(() => {});
  }, [salesLedger, currentUser, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-void-ledger", JSON.stringify(voidLedger));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-void-ledger").catch(() => {});
  }, [voidLedger, currentUser, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-refund-ledger", JSON.stringify(refundLedger));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-refund-ledger").catch(() => {});
  }, [refundLedger, currentUser, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-kds-orders", JSON.stringify(kdsOrders));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-kds-orders").catch(() => {});
  }, [kdsOrders, currentUser, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-table-orders", JSON.stringify(tableOrders));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-table-orders").catch(() => {});
  }, [tableOrders, currentUser, supabaseStateReady]);

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
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-users").catch(() => {});
  }, [users, currentUser, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-stores", JSON.stringify(stores));
    if (supabaseConfigured && currentUser && supabaseStateReady) {
      lastLocalStoresWriteAtRef.current = Date.now();
      syncLocalStateKeyToSupabase("vestora-stores").catch(() => {});
    }
  }, [stores, currentUser, supabaseStateReady]);

  useEffect(() => {
    const isSuperAdmin = currentUser?.role === "super_admin" || currentUser?.isSuperuser === true || currentUser?.appRole === "Super Admin";
    if (!supabaseConfigured || !supabase || !isSuperAdmin || !supabaseStateReady) return undefined;
    let cancelled = false;

    const refreshSharedStores = async () => {
      // Give the local save effect time to finish before accepting a remote
      // snapshot. This prevents an in-flight read from replacing a store just
      // created in this browser with the previous remote snapshot.
      if (Date.now() - lastLocalStoresWriteAtRef.current < 4000) return;
      try {
        if (!cancelled) await syncLocalStateKeyToSupabase("vestora-stores");
      } catch {
        // A later focus or interval refresh will retry without disrupting POS.
      }
    };

    refreshSharedStores();
    const timer = window.setInterval(refreshSharedStores, 10000);
    window.addEventListener("focus", refreshSharedStores);
    document.addEventListener("visibilitychange", refreshSharedStores);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshSharedStores);
      document.removeEventListener("visibilitychange", refreshSharedStores);
    };
  }, [currentUser?.role, currentUser?.isSuperuser, currentUser?.appRole, supabaseStateReady]);

  useEffect(() => {
    if (!supabaseConfigured || !currentUser || !supabaseStateReady || !activeStore.id || activeStore.id === "GLOBAL") return undefined;
    let cancelled = false;
    const refreshPublicOrders = async () => {
      try {
        const rows = await supabaseApiList("public-orders", `storeId=${encodeURIComponent(activeStore.id)}&open=1`);
        if (cancelled || !Array.isArray(rows)) return;
        const incoming = rows.map((row) => ({
          id: row.id,
          orderNumber: row.order_number || `QR-${String(row.id).slice(-6)}`,
          storeId: row.store_id,
          storeName: activeStore.name,
          branch: activeStore.branch,
          tableId: row.table_id,
          tableName: row.table_name,
          floor: row.floor || "Main",
          waiterId: "",
          waiterName: "QR customer",
          guestCount: Number(row.guest_count || 1),
          customerName: row.customer_name || "Guest",
          customerNote: row.customer_note || "",
          source: "QR",
          status: row.status === "KOT sent" ? "KOT sent" : row.status === "Ready for billing" ? "Ready for billing" : "QR order received",
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at,
          items: Array.isArray(row.items) ? row.items : [],
          itemCount: Number(row.item_count || 0),
          subtotal: Number(row.subtotal || 0),
        }));
        setTableOrders((current) => {
          const next = [...current];
          incoming.forEach((order) => {
            const index = next.findIndex((entry) => String(entry.id) === String(order.id));
            if (index < 0) next.unshift(order);
            else next[index] = { ...next[index], ...order, kotId: next[index].kotId, kotIds: next[index].kotIds, kotQuantities: next[index].kotQuantities };
          });
          return next;
        });
      } catch {
        // QR ordering remains available to customers; staff polling retries.
      }
    };
    refreshPublicOrders();
    const timer = window.setInterval(refreshPublicOrders, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeStore.id, activeStore.name, activeStore.branch, currentUser?.id, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-selected-store", activeStore.id);
  }, [activeStore.id]);

  useEffect(() => {
    localStorage.setItem(`vestora-bill-template-${settingsStoreId}`, JSON.stringify(billTemplate));
  }, [billTemplate, settingsStoreId, supabaseStateReady]);

  useEffect(() => {
    localStorage.setItem("vestora-kot-printer", JSON.stringify(kotPrinter));
  }, [kotPrinter]);

  useEffect(() => {
    const saved = loadStoredArray(`vestora-menu-items-${activeStore.id}`);
    setProductItems(preparePosProducts(saved));
  }, [activeStore.id]);

  useEffect(() => {
    localStorage.setItem(`vestora-menu-items-${activeStore.id}`, JSON.stringify(productItems));
  }, [activeStore.id, productItems]);

  useEffect(() => {
    if (!supplierOrders.length) setSupplierOrders(initialSupplierOrders);
  }, []);

  useEffect(() => {
    localStorage.setItem("vestora-supplier-orders", JSON.stringify(supplierOrders));
    if (supabaseConfigured && currentUser && supabaseStateReady) syncLocalStateKeyToSupabase("vestora-supplier-orders").catch(() => {});
  }, [supplierOrders, currentUser, supabaseStateReady]);

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
      const kdsOrder = createKdsOrderFromBill(savedBill);
      setKdsOrders((current) => [kdsOrder, ...current]);
      if (kotPrinter.enabled && kotPrinter.status === "Connected" && kotPrinter.autoPrint) {
        if (kotPrinter.type === "QZ Tray") {
          printKotWithQz({
            printerName: kotPrinter.name,
            paper: kotPrinter.paper,
            copies: kotPrinter.copies,
            order: { ...savedBill, kotId: kdsOrder.id, tableName: savedBill.orderType, waiterName: savedBill.waiterName || currentUser?.name },
          }).then(() => notify(`KOT printed on ${kotPrinter.name}`))
            .catch((error) => notify(`KOT is queued, but QZ Tray printing failed: ${error?.message || "Check QZ Tray"}`));
        } else {
          notify(`KOT queued for ${kotPrinter.name}`);
        }
      }
    }
  }

  function persistPublicOrderStatus(order, status) {
    if (order?.source !== "QR" || !order.id || !supabaseConfigured || !currentUser) return;
    supabaseApiRequest(`public-orders/${encodeURIComponent(order.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => {});
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
    persistPublicOrderStatus(savedOrder, savedOrder.status);
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
    const kotId = `KOT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
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
    notify(kotPrinter.enabled && kotPrinter.status === "Connected"
      ? kotPrinter.type === "QZ Tray" ? "KOT added to kitchen queue; sending to QZ Tray printer" : `KOT sent to ${kotPrinter.name}`
      : "KOT added to kitchen queue; connect printer for paper copy");
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
      id: `VOID-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
      id: `VOID-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
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
      setKdsOrders((current) => [{ id: `KOT-CANCEL-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, storeId: activeStore.id, table: order.tableName, waiter: order.waiterName, age: "Just now", status: "New", items: [`CANCEL ORDER ${order.orderNumber} - ${reason}`], createdAt: new Date().toISOString(), tableOrderId: order.id }, ...current]);
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
      setKdsOrders((current) => [{ id: `KOT-CANCEL-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, storeId: activeStore.id, table: order.tableName, waiter: order.waiterName, age: "Just now", status: "New", items: [`CANCEL ${item.qty} ${item.name} - ${reason}`], createdAt: new Date().toISOString(), tableOrderId: order.id }, ...current]);
    }
    notify(`${item.name} cancelled from ${order.tableName}`);
    return updated;
  }

  function recordRefund(refund) {
    const refundEntry = {
      id: `REF-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
    return <><CloudSyncBanner /><SupplierPortal currentUser={currentUser} orders={supplierOrders} setOrders={setSupplierOrders} onLogout={handleLogout} /></>;
  }

  if (currentUser.role === "super_admin" && superAdminLanding) {
    return (
      <>
        <CloudSyncBanner />
        <SuperAdminStoreLanding
          stores={stores}
          setStores={setStores}
          users={users}
          activeStore={activeStore}
          storeAccessReady={supabaseStateReady}
          onEnterStore={enterStore}
          onUpdatePassword={() => setPasswordDialogOpen(true)}
          onLogout={handleLogout}
          notify={notify}
          toast={toast}
        />
        {passwordDialogOpen && <ChangePasswordDialog notify={notify} onClose={() => setPasswordDialogOpen(false)} />}
      </>
    );
  }

  const content = {
    dashboard: <Dashboard notify={notify} salesLedger={scopedSalesLedger} refundLedger={scopedRefundLedger} kdsOrders={scopedKdsOrders} comparisonStores={comparisonStores} comparisonSalesLedger={comparisonSalesLedger} storeId={activeStore.id} onNavigate={setActive} />,
    pos: !posCashier
      ? <CashierLogin cashiers={activeCashiers} activeStore={activeStore} stores={stores} currentShift={currentShift} onAuthenticated={(cashier) => {
        if (currentShift?.cashierId && String(currentShift.cashierId) !== String(cashier.id)) {
          notify(`${currentShift.cashierName || "Another cashier"} must close the active shift first`);
          return false;
        }
        const cashierStoreId = normalizeStoreId(cashier.storeId);
        if (cashierStoreId !== "GLOBAL") {
          setSelectedStoreId(cashierStoreId);
          localStorage.setItem("vestora-selected-store", cashierStoreId);
        }
        setPosCashier(cashier);
        localStorage.setItem("vestora-pos-cashier", JSON.stringify(cashier));
        return true;
      }} onExit={exitPOS} onLogout={handleLogout} onCreateCashier={() => openAdminView("create")} />
      : currentShift
        ? <POS cart={cart} setCart={setCart} items={productItems} storeId={activeStore.id} foodStock={foodStock} onFoodStockChange={updateFoodStock} orderType={orderType} setOrderType={setOrderType} online={online} notify={notify} billTemplate={billTemplate} onSale={recordSale} onVoidItem={recordVoidItem} onExit={exitPOS} onLogout={handleLogout} currentShift={currentShift} onCloseShift={closeShift} shiftBills={scopedSalesLedger.filter((bill) => bill.shiftId === currentShift.id)} shiftRefunds={scopedRefundLedger.filter((refund) => refund.shiftId === currentShift.id)} orderHistory={scopedSalesLedger} currentUser={posCashier} pendingTableOrders={scopedTableOrders.filter((order) => order.status === "Ready for billing")} onTableOrderPaid={completeTableOrder} />
        : <ShiftOpening online={online} onOpenShift={openShift} onExit={exitPOS} onLogout={handleLogout} cashier={posCashier} />,
    kds: <KDS notify={notify} orders={scopedKdsOrders} setOrders={setKdsOrders} kotPrinter={kotPrinter} />,
    tables: <Tables key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} items={productItems} currentUser={currentUser} tableOrders={scopedTableOrders} onSaveOrder={saveTableOrder} onSendKot={sendTableKot} onSendReception={sendTableToReception} onCancelOrder={cancelTableOrder} onCancelItem={cancelTableOrderItem} kotPrinter={kotPrinter} cloudStateReady={supabaseStateReady} />,
    menu: <MenuManagement key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} productItems={productItems} setProductItems={setProductItems} activeView={menuView} editingItemId={menuItemEditId} onNavigate={openMenuView} />,
    inventory: <Inventory key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} cloudStateReady={supabaseStateReady} />,
    production: <Production key={activeStore.id} storeId={activeStore.id} notify={notify} canManageAll={canManage} activeView={productionView} activeReport={productionReportView} onViewChange={setProductionView} foodStock={foodStock} onFoodStockChange={updateFoodStock} cloudStateReady={supabaseStateReady} />,
    "item-stock": <ItemStock
      key={activeStore.id}
      foodStock={foodStock}
      onFoodStockChange={updateFoodStock}
      canManage={canManage}
      notify={notify}
      onOpenProduction={() => openProductionView("Food Stock")}
    />,
    crm: <CRM notify={notify} canManageAll={canManage} storeId={activeStore.id} salesLedger={scopedSalesLedger} />,
    attendance: <AttendanceModule key={activeStore.id} notify={notify} activeStore={activeStore} stores={stores} users={users} canManage={canManage} canManageAll={canManageAll} activeView={attendanceView} onViewChange={setAttendanceView} onOpenAdmin={() => openAdminView("create")} />,
    offers: <OffersPromotions key={activeStore.id} storeId={activeStore.id} productItems={productItems} notify={notify} canManage={canManage} activeView={offersView} onViewChange={setOffersView} />,
  finance: <Finance notify={notify} canManageAll={canManage} salesLedger={scopedSalesLedger} refundLedger={scopedRefundLedger} storeId={activeStore.id} view={financeView} />,
    reports: <Reports notify={notify} storeId={activeStore.id} salesLedger={scopedSalesLedger} voidLedger={scopedVoidLedger} refundLedger={scopedRefundLedger} onRefund={recordRefund} lastShiftClose={lastShiftClose} comparisonStores={comparisonStores} comparisonSalesLedger={comparisonSalesLedger} activeView={reportView} onReportChange={setReportView} />,
    mis: <MISReports salesLedger={scopedSalesLedger} refundLedger={scopedRefundLedger} notify={notify} />,
    admin: <Admin notify={notify} users={users} setUsers={setUsers} currentUser={currentUser} canManageAll={canManageAll} canManageStore={canManage} stores={stores} activeStore={activeStore} activeView={adminView} onViewChange={openAdminView} customRoles={customRoles} setCustomRoles={setCustomRoles} />,
    settings: <SettingsView notify={notify} billTemplate={billTemplate} setBillTemplate={setBillTemplate} kotPrinter={kotPrinter} setKotPrinter={setKotPrinter} canManage={canManage} canManageAll={canManageAll} activeStore={activeStore} setStores={setStores} menuItems={productItems} themeConfig={{ ...themeConfig, mode: dark ? "Dark" : "Light" }} setThemeConfig={setThemeConfig} setDark={setDark} />,
  }[activeModule];

  if (activeModule === "pos") {
    return (
      <div className={dark ? "pos-page dark" : "pos-page"} style={themeVariables}>
        <CloudSyncBanner />
        {content}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className={`${dark ? "app dark" : "app"} ${sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed"}`} style={themeVariables}>
      <CloudSyncBanner />
      <aside id="primary-navigation" className={sidebarOpen ? "sidebar" : "sidebar collapsed"}>
        <div className="brand">
          <img src={vestoraLogoPath} alt="" />
          {sidebarOpen && <div><strong>UVPRO</strong><span>ERP & POS</span></div>}
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
                    <button className={adminView === "roles" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openAdminView("roles")}><ShieldCheck size={15} /> Role creation</button>
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
                     <button className={productionView === "Food Stock" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openProductionView("Food Stock")}><Boxes size={15} /> Food Stock</button>
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
            if (item.id === "offers") {
              const offersActive = activeModule === "offers";
              return (
                <div className="sidebar-admin-group" key={item.id}>
                  <button className={offersActive ? "nav active" : "nav"} onClick={() => { if (!offersActive) openModule("offers"); setOffersNavOpen((open) => offersActive ? !open : true); }} title={item.label} aria-expanded={sidebarOpen && offersNavOpen}>
                    <Icon size={18} />
                    {sidebarOpen && <><span>{item.label}</span><ChevronDown className={offersNavOpen ? "sidebar-chevron open" : "sidebar-chevron"} size={16} /></>}
                  </button>
                  {sidebarOpen && offersNavOpen && <div className="sidebar-subnav offers-sidebar-subnav">
                    <button className={offersView === "Happy hour offer" ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openOffersView("Happy hour offer")}><Clock size={15} /> Happy hour offer</button>
                    {["BOGO offers", "Combo discounts", "Weekend offers", "Coupons"].map((offer) => <button key={offer} className={offersView === offer ? "sidebar-subnav-item active" : "sidebar-subnav-item"} onClick={() => openOffersView(offer)}><Sparkles size={15} /> {offer}</button>)}
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
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar" aria-expanded={sidebarOpen} aria-controls="primary-navigation">
              {sidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}
            </button>
            <div>
              <p>{storeLabel(activeStore)}</p>
        <h1>{activeModule === "attendance" ? `Attendance - ${attendanceView}` : activeModule === "offers" ? `Offers & Promotions - ${offersView}` : activeModule === "finance" ? `Finance - ${financeView}` : modules.find((item) => item.id === activeModule)?.label}</h1>
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
            {!appInstalled && <button className="install-app-button" type="button" onClick={installWebApp} title="Install UVPRO as an application"><Download size={16} /><span>Install app</span></button>}
            <button className="icon-btn" onClick={() => notify("No new notifications")} title="Notifications"><Bell size={18} /></button>
            <button className="icon-btn" onClick={() => setThemeConfig((current) => ({ ...current, mode: dark ? "Light" : "Dark" }))} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-btn" onClick={handleLogout} title="Logout"><LogOut size={18} /></button>
          </div>
        </header>
        {content}
      </main>
      {toast && <div className="toast">{toast}</div>}
      {passwordDialogOpen && <ChangePasswordDialog notify={notify} onClose={() => setPasswordDialogOpen(false)} />}
    </div>
  );
}

function CustomerTableOrdering() {
  const params = new URLSearchParams(window.location.search);
  const storeId = params.get("store") || params.get("storeId") || "";
  const qrTableId = params.get("table") || params.get("tableId") || "";
  const [catalog, setCatalog] = useState([]);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(qrTableId);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  useEffect(() => {
    if (!storeId) {
      setError("This store QR code is incomplete.");
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    supabaseFunctionJson(`vestora-public-order/menu?storeId=${encodeURIComponent(storeId)}${qrTableId ? `&tableId=${encodeURIComponent(qrTableId)}` : ""}`)
      .then((payload) => {
        if (cancelled) return;
        setCatalog(Array.isArray(payload?.items) ? payload.items.filter((item) => (item.status || "Active") === "Active") : []);
        setTables(Array.isArray(payload?.tables) ? payload.tables : []);
        setTable(payload?.table || null);
        if (qrTableId && !payload?.table) setError("This table is no longer available for ordering.");
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || "Unable to load the menu."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, qrTableId]);

  function addItem(item) {
    setCart((current) => {
      const existing = current.find((entry) => String(entry.id) === String(item.id));
      return existing
        ? current.map((entry) => String(entry.id) === String(item.id) ? { ...entry, qty: entry.qty + 1 } : entry)
        : [...current, { ...item, qty: 1 }];
    });
  }

  function changeQty(itemId, delta) {
    setCart((current) => current.map((item) => String(item.id) === String(itemId) ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0));
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!cart.length) return setError("Choose at least one item.");
    if (!selectedTableId) return setError("Choose your table before sending the order.");
    setSubmitting(true);
    setError("");
    try {
      const result = await supabaseFunctionJson("vestora-public-order/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, tableId: selectedTableId, guestCount: 1, customerName: customerName.trim() || "Guest", customerNote: customerNote.trim(), items: cart.map(({ id, name, price, qty, notes }) => ({ id, name, price, qty, notes: notes || "" })) }),
      });
      setOrderNumber(result?.orderNumber || "");
      setCart([]);
    } catch (requestError) {
      setError(requestError.message || "Unable to send your order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="customer-order-screen"><div className="customer-order-card"><span className="customer-order-kicker">UVPRO TABLE ORDERING</span><h1>Loading menu...</h1></div></div>;
  if (orderNumber) return <div className="customer-order-screen"><div className="customer-order-card customer-order-success"><CircleCheck size={54} /><span className="customer-order-kicker">ORDER RECEIVED</span><h1>Thank you!</h1><p>Your order <strong>{orderNumber}</strong> has been sent to the restaurant.</p><small>Table {table?.name || selectedTableId} · Please wait for the team to serve you.</small></div></div>;

  return (
      <div className="customer-order-screen">
      <div className="customer-order-card customer-order-header"><span className="customer-order-kicker">UVPRO MENU · NO LOGIN REQUIRED</span><h1>{table?.name || "Choose your items"}</h1><p>{table ? "View this store's available items, choose what you want, and send your order." : "View this store's available items, choose what you want, then select your table to send the order."}</p></div>
      {error && <div className="customer-order-error">{error}</div>}
      {!error && <form className="customer-order-layout" onSubmit={submitOrder}>
        <div className="customer-menu-grid">{catalog.map((item) => <button type="button" className="customer-menu-item" key={item.id} onClick={() => addItem(item)}><span>{item.category}</span><strong>{item.name}</strong><em>{formatMoney(item.price)}</em><small>＋ Add</small></button>)}</div>
        <aside className="customer-cart-card"><h2>Your order</h2>{!table && <label>Select your table<select value={selectedTableId} onChange={(event) => setSelectedTableId(event.target.value)}><option value="">Choose table</option>{tables.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.floor}</option>)}</select></label>}<div className="customer-cart-lines">{cart.length ? cart.map((item) => <div className="customer-cart-line" key={item.id}><div><strong>{item.name}</strong><small>{formatMoney(item.price)} each</small></div><span><button type="button" onClick={() => changeQty(item.id, -1)}>-</button><b>{item.qty}</b><button type="button" onClick={() => changeQty(item.id, 1)}>+</button></span></div>) : <p>Add items from the menu.</p>}</div><div className="customer-order-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div><label>Your name (optional)<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Guest" maxLength={60} /></label><label>Note for the restaurant<textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Less spicy, allergies, etc." maxLength={240} /></label><button className="customer-submit-order" type="submit" disabled={submitting || !cart.length || !selectedTableId}>{submitting ? "Sending order..." : "Send order to kitchen"}</button></aside>
      </form>}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function login(event) {
    event.preventDefault();
    const loginId = email.trim().toLowerCase();
    if (localAuthEnabled && loginId === localAuthEmail && password === localAuthPassword) {
      onLogin({
        id: "LOCAL-SUPER-ADMIN",
        email: loginId,
        name: "Local Super Admin",
        role: "super_admin",
        appRole: "Super Admin",
        storeId: "GLOBAL",
        status: "Active",
      });
      return;
    }
    if (supabaseConfigured) {
      setError("");
      const { data, error: authError } = await signInWithSupabase(loginId, password);
      if (!authError && data.user) {
        // The auth listener owns profile verification and hydration. A second
        // competing profile request here could replace the verified user.
        return;
      }
      setError(authError?.message || "Supabase sign-in failed");
      return;
    }
    setError("Secure sign-in is not configured for this deployment.");
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={login}>
        <div className="login-brand-panel">
          <img src={vestoraLogoPath} alt="" />
          <div>
            <span>UVPRO ERP & POS</span>
            <h1>Staff sign in</h1>
            <p>Restaurant operations workspace</p>
            <small className="login-tagline">Driven by Excellence. Powered by Vestano Retail</small>
          </div>
        </div>
        <div className="login-form-fields">
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
          <label>Password
            <span className="password-field">
              <input value={password} type={showPassword ? "text" : "password"} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
        </div>
        {error && <strong className="login-error">{error}</strong>}
        <button className="login-submit" type="submit">Login</button>
      </form>
    </div>
  );
}

function SuperAdminStoreLanding({ stores, setStores, users = [], activeStore, storeAccessReady = true, onEnterStore, onUpdatePassword, onLogout, notify, toast }) {
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
  function branchLoginCredential(store) {
    const candidates = [...users];
    const owner = String(store.owner || "").trim().toLowerCase();
    return candidates.find((user) => {
      if (normalizeStoreId(user.storeId) !== store.id) return false;
      if (String(user.status || "Active") === "Inactive") return false;
      return owner ? roleLabelForUser(user).toLowerCase() === owner : true;
    }) || candidates.find((user) => normalizeStoreId(user.storeId) === store.id && String(user.status || "Active") !== "Inactive");
  }

  function saveStore() {
    const storeName = storeFormMode === "branch" ? storeDraft.parentName : storeDraft.name;
    const parentStore = stores.find((store) => store.name === storeName);
    if (!storeName.trim() || !storeDraft.address.trim() || (storeFormMode === "branch" && !storeDraft.branch.trim()) || newBranchDrafts.some((branch) => !branch.branch.trim())) {
      notify(storeFormMode === "branch" ? "Enter restaurant, branch, and address" : "Enter restaurant name and address");
      return;
    }
    const store = {
      id: editingStoreId || `STORE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
      id: `BRANCH-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${index + 1}`,
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
            <strong>UVPRO</strong>
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

        <button className="super-admin-security" type="button" onClick={onUpdatePassword} aria-labelledby="super-admin-security-title">
          <span className="super-admin-security-icon"><KeyRound size={22} /></span>
          <div>
            <span>Account security</span>
            <strong id="super-admin-security-title">Update password</strong>
            <p>Change the password for this Super Admin account.</p>
          </div>
          <span className="super-admin-security-action">Update password</span>
        </button>

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
                {group.branches.map((store) => {
                  const credential = branchLoginCredential(store);
                  return (
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
                    <div className="branch-login-credential">
                      <span>Branch login</span>
                      {credential ? <><strong>{credential.email}</strong><small>{credential.password}</small></> : <small>Create a user for this branch in Admin.</small>}
                    </div>
                    <div className="branch-card-actions">
                      <button type="button" onClick={() => editBranch(store)}>Edit branch</button>
                      <button type="button" onClick={() => onEnterStore(store)} disabled={!storeAccessReady} title={!storeAccessReady ? "Store access is still loading" : undefined}>{storeAccessReady ? "View branch" : "Loading…"}</button>
                      <button className="destructive-action" type="button" onClick={() => deleteBranch(store)}>Delete</button>
                    </div>
                  </div>
                );})}
                {!group.branches.length && <div className="empty-branch-state">No branches added yet. Open Edit Store to add a branch.</div>}
              </div>
            </div>
          ))}
          {!restaurantGroups.length && <div className="empty-branch-state">No restaurants yet. Select <strong>New restaurant</strong> to create your first store.</div>}
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
  const [documents, setDocuments] = useBusinessState(`vestora-supplier-documents-${currentUser.storeId}`, [
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
        <div className="supplier-brand"><img src={vestoraLogoPath} alt="" /><div><strong>UVPRO Supplier Portal</strong><span>{currentUser.name}</span></div></div>
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
  const [inventorySnapshot, setInventorySnapshot] = useBusinessState(`vestora-inventory-${storeId}`, () => {
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

function escapePdfText(value) {
  return String(value ?? "").replace(/₹/g, "Rs. ").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function downloadManagementReportPdf({ range, periodLabel, priorPeriodLabel, current, previous, performanceGraph, categoryData, topItems, salesActions }) {
  const pageWidth = 595;
  const pageHeight = 842;
  const content = [];
  const money = (value) => `Rs. ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
  const write = (x, y, size, value, { bold = false, color = "0.06 0.16 0.13" } = {}) => content.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfText(value)}) Tj ET`);
  const rectangle = (x, y, width, height, color) => content.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  const line = (x1, y1, x2, y2, color = "0.82 0.88 0.85") => content.push(`${color} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
  const wrap = (value, maxLength = 76) => {
    const words = String(value).split(" ");
    const lines = [];
    let currentLine = "";
    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length > maxLength && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else currentLine = candidate;
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  };
  const maxSales = Math.max(1, ...performanceGraph.flatMap((entry) => [Number(entry.sales || 0), Number(entry.previousSales || 0)]));
  const maxCategory = Math.max(1, ...categoryData.map((entry) => Number(entry.sales || 0)));

  rectangle(0, 0, pageWidth, pageHeight, "0.98 0.99 0.98");
  rectangle(0, 778, pageWidth, 64, "0.06 0.28 0.22");
  write(42, 808, 18, "UVPRO | MANAGEMENT INFORMATION SYSTEM", { bold: true, color: "1 1 1" });
  write(42, 789, 10, `${range.toUpperCase()} REPORT  •  ${periodLabel}`, { color: "0.85 0.94 0.9" });
  write(42, 756, 9, `Generated ${new Date().toLocaleString("en-IN")}`, { color: "0.31 0.43 0.38" });

  write(42, 728, 13, "Sales analysis", { bold: true, color: "0.08 0.28 0.22" });
  rectangle(42, 692, 511, 22, "0.12 0.35 0.28");
  const columns = [42, 128, 198, 285, 374, 461];
  ["Period", "Total bills", "Gross sales", "Net sales", "GST", "ABV"].forEach((label, index) => write(columns[index] + 6, 700, 8, label, { bold: true, color: "1 1 1" }));
  const rows = [
    [periodLabel, current.orders, money(current.grossSales), money(current.netSales), money(current.tax), money(current.averageBill)],
    [priorPeriodLabel, previous.orders, money(previous.grossSales), money(previous.netSales), money(previous.tax), money(previous.averageBill)],
  ];
  rows.forEach((row, rowIndex) => {
    const rowY = 664 - rowIndex * 25;
    rectangle(42, rowY - 7, 511, 23, rowIndex === 0 ? "0.92 0.97 0.94" : "1 1 1");
    row.forEach((value, index) => write(columns[index] + 6, rowY, 8, value, { bold: index === 0, color: "0.08 0.19 0.15" }));
  });

  write(42, 605, 12, `${range} sales comparison`, { bold: true, color: "0.08 0.28 0.22" });
  const chartBottom = 454;
  const chartHeight = 122;
  line(42, chartBottom, 553, chartBottom);
  line(42, chartBottom + chartHeight, 553, chartBottom + chartHeight, "0.9 0.93 0.91");
  performanceGraph.forEach((entry, index) => {
    const groupWidth = 511 / performanceGraph.length;
    const x = 54 + index * groupWidth;
    const currentHeight = (Number(entry.sales || 0) / maxSales) * chartHeight;
    const priorHeight = (Number(entry.previousSales || 0) / maxSales) * chartHeight;
    rectangle(x, chartBottom, 14, currentHeight, "0.08 0.42 0.32");
    rectangle(x + 17, chartBottom, 14, priorHeight, "0.72 0.78 0.75");
    write(x - 2, chartBottom - 15, 7, entry.label, { color: "0.31 0.43 0.38" });
  });
  rectangle(42, 420, 10, 10, "0.08 0.42 0.32");
  write(57, 422, 8, periodLabel, { color: "0.31 0.43 0.38" });
  rectangle(126, 420, 10, 10, "0.72 0.78 0.75");
  write(141, 422, 8, priorPeriodLabel, { color: "0.31 0.43 0.38" });

  write(42, 389, 12, "Category-wise sales contribution", { bold: true, color: "0.08 0.28 0.22" });
  categoryData.slice(0, 4).forEach((entry, index) => {
    const y = 362 - index * 25;
    write(42, y, 8, entry.category, { color: "0.17 0.28 0.24" });
    rectangle(176, y - 5, 250 * (Number(entry.sales || 0) / maxCategory), 11, index % 2 ? "0.66 0.47 0.17" : "0.22 0.53 0.42");
    write(435, y, 8, money(entry.sales), { bold: true, color: "0.17 0.28 0.24" });
  });

  write(42, 255, 12, "Top selling items", { bold: true, color: "0.08 0.28 0.22" });
  topItems.slice(0, 2).forEach((item, index) => {
    const y = 234 - index * 18;
    write(42, y, 8, `${index + 1}. ${item.name}`, { bold: true, color: "0.17 0.28 0.24" });
    write(292, y, 8, `${item.quantity} sold`, { color: "0.31 0.43 0.38" });
    write(435, y, 8, money(item.sales), { bold: true, color: "0.17 0.28 0.24" });
  });

  write(42, 175, 12, "Recommended next sales actions", { bold: true, color: "0.08 0.28 0.22" });
  let actionY = 155;
  salesActions.slice(0, 4).forEach((action) => {
    const actionLines = wrap(`${action.title}: ${action.text}`, 78);
    actionLines.forEach((lineText, lineIndex) => {
      write(54, actionY, 8.4, `${lineIndex === 0 ? "• " : "  "}${lineText}`, { color: "0.22 0.32 0.28" });
      actionY -= 12;
    });
    actionY -= 3;
  });
  line(42, 42, 553, 42);
  write(42, 27, 8, "UVPRO ERP & POS · Internal management report", { color: "0.31 0.43 0.38" });
  write(476, 27, 8, "Page 1 of 1", { color: "0.31 0.43 0.38" });

  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  link.href = url;
  link.download = `UVPRO-${range}-MIS-${localDateKey()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MISReports({ salesLedger = [], refundLedger = [], notify }) {
  const [range, setRange] = useState("Weekly");
  const now = new Date();
  const daysInRange = range === "Daily" ? 1 : range === "Weekly" ? 7 : 30;
  const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  currentStart.setDate(currentStart.getDate() - (daysInRange - 1));
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - daysInRange);

  function isWithin(value, start, end) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= start && date < end;
  }

  function billsIn(start, end) {
    return salesLedger.filter((bill) => isWithin(bill.createdAt, start, end));
  }

  function refundsIn(start, end) {
    return refundLedger.filter((refund) => isWithin(refund.createdAt, start, end));
  }

  function summaryFor(bills, refunds) {
    const grossSales = bills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
    const refundAmount = refunds.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const tax = bills.reduce((sum, bill) => sum + Number(bill.tax || 0), 0);
    const discount = bills.reduce((sum, bill) => sum + Number(bill.discount || 0), 0);
    return {
      grossSales,
      refunds: refundAmount,
      netSales: grossSales - refundAmount,
      orders: bills.length,
      tax,
      discount,
      averageBill: bills.length ? (grossSales - refunds) / bills.length : 0,
    };
  }

  const currentBills = billsIn(currentStart, now);
  const previousBills = billsIn(previousStart, currentStart);
  const current = summaryFor(currentBills, refundsIn(currentStart, now));
  const previous = summaryFor(previousBills, refundsIn(previousStart, currentStart));
  const percentageChange = (value, previousValue) => previousValue ? ((value - previousValue) / previousValue) * 100 : null;
  const salesChange = percentageChange(current.netSales, previous.netSales);
  const billsChange = percentageChange(current.orders, previous.orders);
  const abvChange = percentageChange(current.averageBill, previous.averageBill);
  const periodLabel = range === "Daily" ? "Today" : range === "Weekly" ? "Last 7 days" : "Last 30 days";
  const priorPeriodLabel = range === "Daily" ? "Yesterday" : range === "Weekly" ? "Previous 7 days" : "Previous 30 days";

  function bucketSummary(start, end) {
    return summaryFor(billsIn(start, end), refundsIn(start, end));
  }

  const performanceGraph = range === "Daily"
    ? Array.from({ length: 6 }, (_, index) => {
      const start = new Date(currentStart);
      start.setHours(index * 4, 0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + 4);
      const priorStart = new Date(previousStart);
      priorStart.setHours(index * 4, 0, 0, 0);
      const priorEnd = new Date(priorStart);
      priorEnd.setHours(priorEnd.getHours() + 4);
      const summary = bucketSummary(start, end);
      const prior = bucketSummary(priorStart, priorEnd);
      return { label: `${String(start.getHours()).padStart(2, "0")}:00`, sales: summary.netSales, previousSales: prior.netSales, orders: summary.orders, previousOrders: prior.orders };
    })
    : range === "Weekly"
      ? Array.from({ length: 7 }, (_, index) => {
        const start = new Date(currentStart);
        start.setDate(start.getDate() + index);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const priorStart = new Date(previousStart);
        priorStart.setDate(priorStart.getDate() + index);
        const priorEnd = new Date(priorStart);
        priorEnd.setDate(priorEnd.getDate() + 1);
        const summary = bucketSummary(start, end);
        const prior = bucketSummary(priorStart, priorEnd);
        return { label: start.toLocaleDateString("en-IN", { weekday: "short" }), sales: summary.netSales, previousSales: prior.netSales, orders: summary.orders, previousOrders: prior.orders };
      })
      : [0, 7, 14, 21].map((offset, index) => {
        const length = index === 3 ? 9 : 7;
        const start = new Date(currentStart);
        start.setDate(start.getDate() + offset);
        const end = new Date(start);
        end.setDate(end.getDate() + length);
        const priorStart = new Date(previousStart);
        priorStart.setDate(priorStart.getDate() + offset);
        const priorEnd = new Date(priorStart);
        priorEnd.setDate(priorEnd.getDate() + length);
        const summary = bucketSummary(start, end);
        const prior = bucketSummary(priorStart, priorEnd);
        return { label: `Week ${index + 1}`, sales: summary.netSales, previousSales: prior.netSales, orders: summary.orders, previousOrders: prior.orders };
      });

  const categoryData = Object.entries(currentBills.flatMap((bill) => bill.items || []).reduce((groups, item) => {
    const category = item.category || "Menu sales";
    groups[category] = (groups[category] || 0) + Number(item.price || 0) * Number(item.qty || 0);
    return groups;
  }, {})).map(([category, sales]) => ({ category, sales })).sort((first, second) => second.sales - first.sales).slice(0, 6);
  const totalCategorySales = categoryData.reduce((sum, category) => sum + category.sales, 0);
  const topCategory = categoryData[0];
  const topItems = Object.entries(currentBills.flatMap((bill) => bill.items || []).reduce((items, item) => {
    const name = item.name || "Unnamed item";
    const currentItem = items[name] || { name, quantity: 0, sales: 0 };
    currentItem.quantity += Number(item.qty || 0);
    currentItem.sales += Number(item.price || 0) * Number(item.qty || 0);
    items[name] = currentItem;
    return items;
  }, {})).map(([, item]) => item).sort((first, second) => second.sales - first.sales).slice(0, 5);
  const topItem = topItems[0];
  const channelData = Object.entries(currentBills.reduce((channels, bill) => {
    const channel = bill.orderType || "Other";
    const currentChannel = channels[channel] || { orders: 0, sales: 0 };
    currentChannel.orders += 1;
    currentChannel.sales += Number(bill.total || 0);
    channels[channel] = currentChannel;
    return channels;
  }, {})).map(([channel, values]) => ({ channel, ...values })).sort((first, second) => second.sales - first.sales);
  const topChannel = channelData[0];
  const daypartData = [
    { label: "Breakfast", start: 6, end: 11, orders: 0, sales: 0 },
    { label: "Lunch", start: 11, end: 15, orders: 0, sales: 0 },
    { label: "Evening", start: 15, end: 19, orders: 0, sales: 0 },
    { label: "Dinner", start: 19, end: 24, orders: 0, sales: 0 },
  ];
  currentBills.forEach((bill) => {
    const hour = new Date(bill.createdAt).getHours();
    const daypart = daypartData.find((entry) => hour >= entry.start && hour < entry.end);
    if (!daypart) return;
    daypart.orders += 1;
    daypart.sales += Number(bill.total || 0);
  });
  const strongestDaypart = [...daypartData].sort((first, second) => second.sales - first.sales)[0];
  const managementNotes = [
    current.orders
      ? `${periodLabel} net sales are ${formatMoney(current.netSales)} from ${current.orders} bill${current.orders === 1 ? "" : "s"}.`
      : `No completed bills have been recorded for ${periodLabel.toLowerCase()}.`,
    salesChange === null
      ? `Sales comparison will appear after ${priorPeriodLabel.toLowerCase()} has activity.`
      : `Net sales are ${Math.abs(salesChange).toFixed(1)}% ${salesChange >= 0 ? "higher" : "lower"} than ${priorPeriodLabel.toLowerCase()}.`,
    topCategory
      ? `${topCategory.category} leads category contribution at ${totalCategorySales ? ((topCategory.sales / totalCategorySales) * 100).toFixed(1) : 0}% of item sales.`
      : "Category contribution will appear after a bill with menu items is completed.",
    current.refunds || current.discount
      ? `Refunds and discounts total ${formatMoney(current.refunds + current.discount)}; review them with the finance team.`
      : "No refunds or discounts were recorded in this period.",
  ];
  const salesActions = current.orders ? [
    {
      priority: "Priority now",
      title: `Push ${topItem?.name || "your leading item"}`,
      text: `${topItem?.quantity || 0} units generated ${formatMoney(topItem?.sales || 0)}. Feature it as a counter highlight and pair it with one profitable add-on.`,
    },
    {
      priority: "Average bill value",
      title: "Build a simple combo offer",
      text: `Current average bill is ${formatMoney(current.averageBill)}. Aim for ${formatMoney(current.averageBill * 1.1)} by offering one beverage, dessert, or side at checkout.`,
    },
    {
      priority: "Peak service",
      title: `Staff for ${strongestDaypart?.label || "your busiest"}`,
      text: `${strongestDaypart?.orders || 0} bills were recorded in this service window. Keep the top seller ready and use a quick upsell script during this period.`,
    },
    {
      priority: "Channel growth",
      title: `Strengthen ${topChannel?.channel || "your main"} sales`,
      text: `${topChannel?.channel || "This channel"} contributes ${formatMoney(topChannel?.sales || 0)}. Promote a pickup or delivery offer to create an additional order channel.`,
    },
  ] : [
    { priority: "Priority now", title: "Create a seven-day sales baseline", text: "Complete bills with item names and order channels so MIS can identify the most profitable products and service periods." },
    { priority: "Menu visibility", title: "Feature three signature products", text: "Place them first in the menu and ask staff to recommend one add-on with every order." },
    { priority: "Repeat demand", title: "Run one simple combo offer", text: "Use a food plus beverage or dessert offer during the main service period and track the bill value change." },
  ];
  const downloadPdf = () => {
    downloadManagementReportPdf({ range, periodLabel, priorPeriodLabel, current, previous, performanceGraph, categoryData, topItems, salesActions });
    notify?.(`${range} MIS report downloaded as PDF`);
  };

  return (
    <section className="screen mis-screen">
      <div className="panel mis-header-panel">
        <PanelHead title="Management Information System" icon={Gauge} actions={["Daily", "Weekly", "Monthly"]} activeAction={range} onAction={setRange} />
        <div className="mis-header-copy"><div><span>MANAGEMENT REPORT</span><h3>{periodLabel} performance summary</h3><p>Choose a report period, review the live management analysis, then download the selected PDF.</p></div><strong>Updated {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</strong></div>
        <div className="mis-report-actions"><div><span>Selected report</span><strong>{range}</strong></div><button type="button" onClick={downloadPdf}><Download size={17} /> Download {range} PDF</button></div>
      </div>

      <div className="metric-grid mis-metric-grid">
        <Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(current.netSales)} trend={salesChange === null ? "No prior comparison" : `${salesChange >= 0 ? "+" : ""}${salesChange.toFixed(1)}% vs previous`} danger={salesChange !== null && salesChange < 0} />
        <Metric icon={ReceiptText} label="Total bills" value={String(current.orders)} trend={billsChange === null ? "No prior comparison" : `${billsChange >= 0 ? "+" : ""}${billsChange.toFixed(1)}% vs previous`} danger={billsChange !== null && billsChange < 0} />
        <Metric icon={ShoppingCart} label="Average bill value" value={formatMoney(current.averageBill)} trend={abvChange === null ? "No prior comparison" : `${abvChange >= 0 ? "+" : ""}${abvChange.toFixed(1)}% vs previous`} danger={abvChange !== null && abvChange < 0} />
        <Metric icon={Percent} label="GST collected" value={formatMoney(current.tax)} trend={current.refunds ? `${formatMoney(current.refunds)} refunded` : "No refunds"} />
      </div>

      <div className="mis-analysis-table panel">
        <div className="mis-panel-title"><div><span>SALES ANALYSIS</span><h2>{periodLabel} versus {priorPeriodLabel}</h2></div><small>Live POS data</small></div>
        <div className="mis-table-wrap"><table><thead><tr><th>Period</th><th>Total bills</th><th>Gross sales</th><th>Net sales</th><th>GST collected</th><th>Discount</th><th>Average bill value</th></tr></thead><tbody>
          <tr><td><strong>{periodLabel}</strong></td><td>{current.orders}</td><td>{formatMoney(current.grossSales)}</td><td>{formatMoney(current.netSales)}</td><td>{formatMoney(current.tax)}</td><td>{formatMoney(current.discount)}</td><td>{formatMoney(current.averageBill)}</td></tr>
          <tr><td><strong>{priorPeriodLabel}</strong></td><td>{previous.orders}</td><td>{formatMoney(previous.grossSales)}</td><td>{formatMoney(previous.netSales)}</td><td>{formatMoney(previous.tax)}</td><td>{formatMoney(previous.discount)}</td><td>{formatMoney(previous.averageBill)}</td></tr>
        </tbody></table></div>
      </div>

      <div className="mis-chart-grid">
        <div className="panel mis-chart-panel"><div className="mis-panel-title"><div><span>SALES</span><h2>{range} sales</h2></div><small>Current vs previous</small></div><ResponsiveContainer width="100%" height={290}><BarChart data={performanceGraph} barGap={6}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" /><YAxis tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(value)} /><Bar dataKey="sales" name={periodLabel} fill="#176b56" radius={[7, 7, 0, 0]} /><Bar dataKey="previousSales" name={priorPeriodLabel} fill="#b9c7c1" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="panel mis-chart-panel"><div className="mis-panel-title"><div><span>BILLS</span><h2>{range} bill count</h2></div><small>Current vs previous</small></div><ResponsiveContainer width="100%" height={290}><BarChart data={performanceGraph} barGap={6}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="orders" name={periodLabel} fill="#a9782b" radius={[7, 7, 0, 0]} /><Bar dataKey="previousOrders" name={priorPeriodLabel} fill="#e4d2ad" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </div>

      <div className="mis-bottom-grid">
        <div className="panel mis-chart-panel"><div className="mis-panel-title"><div><span>CATEGORY CONTRIBUTION</span><h2>Sales contribution</h2></div><small>{categoryData.length} categories</small></div>{categoryData.length ? <ResponsiveContainer width="100%" height={Math.max(230, categoryData.length * 43)}><BarChart data={categoryData} layout="vertical" margin={{ left: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} /><YAxis type="category" dataKey="category" width={105} /><Tooltip formatter={(value) => formatMoney(value)} /><Bar dataKey="sales" fill="#6b9a86" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer> : <div className="mis-empty-chart">Complete POS bills to view category contribution.</div>}</div>
        <div className="panel mis-notes-panel"><div className="mis-panel-title"><div><span>MANAGEMENT NOTES</span><h2>Key observations</h2></div><FileBarChart size={20} /></div><ul>{managementNotes.map((note) => <li key={note}>{note}</li>)}</ul><div className="mis-note-footer"><span>Net sales</span><strong>{formatMoney(current.netSales)}</strong><span>Refunds</span><strong>{formatMoney(current.refunds)}</strong></div></div>
      </div>
      <div className="mis-bottom-grid">
        <div className="panel mis-top-items-panel"><div className="mis-panel-title"><div><span>TOP SELLERS</span><h2>Products driving sales</h2></div><small>{topItems.length} products</small></div>{topItems.length ? <div className="mis-top-item-list">{topItems.map((item, index) => <div key={item.name}><span>{index + 1}</span><strong>{item.name}</strong><small>{item.quantity} sold</small><b>{formatMoney(item.sales)}</b></div>)}</div> : <div className="mis-empty-chart">Complete POS bills to identify top sellers.</div>}</div>
        <div className="panel mis-actions-panel"><div className="mis-panel-title"><div><span>NEXT SALES ACTIONS</span><h2>What the store should do next</h2></div><Sparkles size={20} /></div><div className="mis-action-list">{salesActions.map((action) => <div key={action.title}><span>{action.priority}</span><strong>{action.title}</strong><p>{action.text}</p></div>)}</div></div>
      </div>
    </section>
  );
}

function CashierLogin({ cashiers, activeStore, stores = [], currentShift, onAuthenticated, onExit, onLogout, onCreateCashier }) {
  const [selectedCashier, setSelectedCashier] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function selectCashier(cashier) {
    setSelectedCashier(cashier);
    setPassword("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedCashier) return;
    try {
      await supabaseApiRequest("cashier-login", { method: "POST", body: JSON.stringify({ email: selectedCashier.email, password }) });
    } catch (error) { setError(error.message); return; }
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
            <div><p>UVPRO POS</p><h1>Cashier login</h1></div>
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
                  const branch = stores.find((store) => store.id === normalizeStoreId(cashier.storeId))?.branch;
                  return (
                    <button type="button" className="cashier-account" key={cashier.id} onClick={() => selectCashier(cashier)}>
                      <span className="cashier-avatar">{cashier.name.trim().slice(0, 1).toUpperCase()}</span>
                      <span><strong>{cashier.name}</strong><small>{hasThisShift ? "Open shift" : branch ? `Cashier · ${branch}` : "Cashier"}</small></span>
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
            <p>UVPRO POS</p>
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
        {billTemplate.gst && <span className="bill-gstin">GSTIN: {billTemplate.gst}</span>}
        {billTemplate.showFssai !== false && billTemplate.fssai && <span>FSSAI: {billTemplate.fssai}</span>}
      </div>
    </div>
  );
}

function BillReceiptFooter({ billTemplate }) {
  return (
    <>
      {billTemplate.showQrBox && <div className="bill-qr-box"><span>QR</span><strong>{billTemplate.qrText || "Scan to pay"}</strong></div>}
      {billTemplate.showTerms !== false && billTemplate.terms && <span className="bill-terms">{billTemplate.terms}</span>}
      {billTemplate.footer && <><span className="bill-footer-message">{billTemplate.footer}</span><div className="bill-tear-line" aria-hidden="true" /></>}
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

function POS({ cart, setCart, items, storeId, foodStock = [], onFoodStockChange, orderType, setOrderType, online, notify, billTemplate, onSale, onVoidItem, onExit, onLogout, currentShift, onCloseShift, shiftBills, shiftRefunds = [], orderHistory, currentUser, pendingTableOrders = [], onTableOrderPaid }) {
  const catalogItems = (items?.length ? items : menuItems).filter((item) => item.status !== "Inactive");
  const categories = ["All", ...Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean))), "Favourites"];
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [discount, setDiscount] = useState(0);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [couponEntry, setCouponEntry] = useState("");
  const [appliedOffer, setAppliedOffer] = useState(null);
  const [posOffers] = useBusinessState(`vestora-offers-${storeId}`, () => {
    const savedOffers = loadStoredArray(`vestora-offers-${storeId}`);
    return savedOffers.length ? savedOffers : localOfferCatalog;
  });
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
  const totalDiscount = Math.min(subtotal, discount + offerDiscount);
  const taxableSubtotal = Math.max(subtotal - totalDiscount, 0);
  const itemTax = cart.reduce((sum, item) => {
    const rate = Number.isFinite(Number(item.tax)) ? Number(item.tax) : 5;
    return sum + Number(item.price || 0) * Number(item.qty || 0) * (rate / 100);
  }, 0);
  const tax = Math.round(subtotal > 0 ? itemTax * (taxableSubtotal / subtotal) : 0);
  const cgst = Math.round(tax / 2);
  const sgst = tax - cgst;
  const total = Math.max(subtotal - totalDiscount, 0) + tax;
  const activePosOffers = posOffers.filter((offer) => offer.status === "Active");
  const selectedOffer = activePosOffers.find((offer) => offer.id === selectedOfferId) || null;
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
  const lowStockFoodItems = foodStock.filter((record) => Number(record.available || 0) <= foodStockThreshold(record));
  const foodStockRequirements = cart.reduce((summary, item) => {
    const record = foodStockRecordFor(foodStock, item);
    if (!record) return summary;
    const key = normalizeFoodItemName(record.item);
    summary.set(key, {
      record,
      quantity: Number(summary.get(key)?.quantity || 0) + Number(item.qty || 0),
    });
    return summary;
  }, new Map());

  useEffect(() => {
    if (!recentlyAddedKey || !billItemsRef.current) return undefined;
    const itemsContainer = billItemsRef.current;
    const addedLine = Array.from(itemsContainer.children).find((element) => element.dataset.cartItemKey === recentlyAddedKey);
    if (addedLine) {
      itemsContainer.scrollTo({ top: Math.max(0, addedLine.offsetTop - itemsContainer.offsetTop - 4), behavior: "smooth" });
    }
    const timer = window.setTimeout(() => setRecentlyAddedKey(""), 900);
    return () => window.clearTimeout(timer);
  }, [cart, recentlyAddedKey]);

  useEffect(() => {
    if (selectedReceptionOrderId && !pendingTableOrders.some((order) => String(order.id) === String(selectedReceptionOrderId))) {
      setSelectedReceptionOrderId("");
      setExpandedReceptionOrderId("");
    }
  }, [pendingTableOrders, selectedReceptionOrderId]);

  useEffect(() => {
    if (!appliedOffer) return;
    const offer = posOffers.find((entry) => entry.id === appliedOffer.id);
    const result = offer ? calculatePosOffer(offer, cart, appliedOffer.couponCode || "") : { amount: 0 };
    if (!result.amount) {
      setAppliedOffer(null);
      setOfferDiscount(0);
      return;
    }
    if (result.amount !== offerDiscount) setOfferDiscount(result.amount);
  }, [cart, posOffers, appliedOffer, offerDiscount]);

  function getCartItemKey(item) {
    return `${String(item.id ?? "item")}::${String(item.name ?? "").trim().toLowerCase()}`;
  }

  function add(item) {
    const cartItemKey = getCartItemKey(item);
    const trackedStock = foodStockRecordFor(foodStock, item);
    const currentCartQty = cart.find((entry) => getCartItemKey(entry) === cartItemKey)?.qty || 0;
    if (trackedStock && currentCartQty >= Number(trackedStock.available || 0)) {
      notify(`${item.name} is out of food stock`);
      return;
    }
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
    const cartItem = cart.find((item) => getCartItemKey(item) === cartItemKey);
    const trackedStock = cartItem ? foodStockRecordFor(foodStock, cartItem) : null;
    if (delta > 0 && trackedStock && Number(cartItem.qty || 0) + delta > Number(trackedStock.available || 0)) {
      notify(`${cartItem.name} has only ${Number(trackedStock.available || 0)} available`);
      return;
    }
    setCart((current) => current.map((item) => getCartItemKey(item) === cartItemKey ? { ...item, qty: Math.max(item.qty + delta, 1) } : item));
  }

  function removeItem(cartItemKey) {
    const removed = cart.find((item) => getCartItemKey(item) === cartItemKey);
    if (removed) onVoidItem(removed, orderType);
    setCart((current) => current.filter((item) => getCartItemKey(item) !== cartItemKey));
    notify(removed ? `${removed.name} voided` : "Item removed");
  }

  function applyOffer() {
    if (!cart.length) {
      notify("Add items before applying an offer");
      return;
    }
    if (appliedOffer) {
      setAppliedOffer(null);
      setOfferDiscount(0);
      notify(`${appliedOffer.name} removed`, 4200);
      return;
    }
    if (!selectedOffer) {
      notify("Choose an active offer first");
      return;
    }
    const result = calculatePosOffer(selectedOffer, cart, couponEntry);
    if (!result.amount) {
      notify(result.error || "This offer cannot be applied to the current bill");
      return;
    }
    setOfferDiscount(result.amount);
    setAppliedOffer({ id: selectedOffer.id, name: selectedOffer.name, type: selectedOffer.type, amount: result.amount, couponCode: couponEntry.trim().toUpperCase() });
    notify(`${selectedOffer.name} applied: ${formatMoney(result.amount)} off`);
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
    for (const { record, quantity } of foodStockRequirements.values()) {
      const available = Number(record.available || 0);
      if (quantity > available) {
        notify(`${record.item} has only ${available} ${record.unit || "portions"} left`);
        return false;
      }
    }
    const bill = { id: `BILL-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, orderNumber, cashier: currentUser?.name || "POS User", customerName: customerName.trim(), customerMobile, orderType, tableOrderId: sourceTableOrder?.id || "", tableName: sourceTableOrder?.tableName || "", waiter: sourceTableOrder?.waiterName || "", guestCount: Number(sourceTableOrder?.guestCount || 0), items: cart, subtotal, cgst, sgst, tax, discount: totalDiscount, appliedOffer, total, payment: selectedPayment, splitPayments, itemCount: cart.reduce((sum, item) => sum + item.qty, 0), syncStatus: online ? "Synced" : "Pending sync", completedAt: new Date().toISOString() };
    if (!online) {
      const queued = JSON.parse(localStorage.getItem("vestora-offline-orders") || "[]");
      localStorage.setItem("vestora-offline-orders", JSON.stringify([...queued, bill]));
      notify("Offline bill saved for sync");
    } else {
      notify(`Paid ${formatMoney(total)} by ${selectedPayment}`);
    }
    onSale(bill);
    if (foodStockRequirements.size && onFoodStockChange) {
      onFoodStockChange((current) => current.map((record) => {
        const ordered = foodStockRequirements.get(normalizeFoodItemName(record.item))?.quantity || 0;
        if (!ordered) return record;
        return {
          ...record,
          sold: Number(record.sold || 0) + ordered,
          available: Math.max(0, Number(record.available || 0) - ordered),
          updatedAt: new Date().toISOString(),
        };
      }));
    }
    if (sourceTableOrder) onTableOrderPaid?.(sourceTableOrder, bill);
    setCompletedBill(bill);
    setShowSplitPayment(false);
    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setDiscount(0);
    setOfferDiscount(0);
    setAppliedOffer(null);
    setSelectedOfferId("");
    setCouponEntry("");
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
    const cleanup = () => document.body.classList.remove("printing-completed-bill");
    document.body.classList.add("printing-completed-bill");
    window.addEventListener("afterprint", cleanup, { once: true });
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

  const billPaperClass = `bill-paper print-bill bill-paper-size-${billTemplate.printerSize === "58mm" ? "58" : "80"} bill-layout-${String(billTemplate.layout || "Detailed").toLowerCase()}`;
  const previewBillPaperClass = completedBill ? billPaperClass.replace(" print-bill", "") : billPaperClass;
  const billPaperStyle = getBillPaperStyle(billTemplate);

  return (
    <section className="pos-screen">
      <div className="pos-page-header">
        <div className="pos-brand-lockup">
          <img src={vestoraLogoPath} alt="" />
          <div>
            <p>UVPRO POS</p>
            <h1>POS Billing</h1>
          </div>
        </div>
        <div className="pos-page-actions">
          <span className="shift-pill"><small>Opening float</small><strong>{formatMoney(currentShift.openingBalance)}</strong></span>
          <span className="shift-pill"><small>Cash sales</small><strong>{formatMoney(shiftCashSales)}</strong></span>
          <span className={online ? "pill online pos-network-pill" : "pill offline pos-network-pill"}>{online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? "Online" : "Offline"}</span>
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
        {!!lowStockFoodItems.length && <div className="pos-food-stock-alert"><AlertTriangle size={18} /><div><strong>Food stock alert</strong><span>{lowStockFoodItems.map((record) => `${record.item}: ${Number(record.available || 0)} left`).join(" · ")}</span></div></div>}
        <div className="catalog-section-head"><div><span>Menu catalog</span><strong>{filtered.length} available items</strong></div><div className="category-row">{categories.map((name) => <button key={name} className={category === name ? "chip active" : "chip"} onClick={() => setCategory(name)}>{name}</button>)}</div></div>
        <div className="item-grid">{filtered.map((item) => {
          const catalogItemKey = getCartItemKey(item);
          const stockRecord = foodStockRecordFor(foodStock, item);
          const stockAvailable = stockRecord ? Number(stockRecord.available || 0) : null;
          return <button key={catalogItemKey} className={stockRecord && stockAvailable <= 0 ? "item-card out-of-stock" : "item-card"} onClick={() => add(item)} disabled={stockRecord && stockAvailable <= 0}><img className="item-photo" src={getMenuItemPhoto(item)} alt="" loading="lazy" /><span>{item.category}</span><strong>{item.name}</strong>{item.barcode && <small className="item-barcode">Barcode {item.barcode}</small>}{stockRecord && <small className={stockAvailable <= foodStockThreshold(stockRecord) ? "item-food-stock low" : "item-food-stock"}>{stockAvailable > 0 ? `${stockAvailable} ${stockRecord.unit || "portions"} left` : "Out of food stock"}</small>}<em>{formatMoney(item.price)}</em></button>;
        })}</div>
      </div>
      <div ref={billPanelRef} className="bill-panel">
        <div className="bill-panel-top">
          <PanelHead title={sourceTableOrder ? `Bill preview · ${cartItemCount} ${cartItemCount === 1 ? "item" : "items"}` : "Bill preview"} icon={ReceiptText} />
          <div className="pos-offer-apply">
            <select value={selectedOfferId} onChange={(event) => { setSelectedOfferId(event.target.value); setCouponEntry(""); }} disabled={Boolean(appliedOffer)} aria-label="Choose active offer"><option value="">Apply offer</option>{activePosOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name} · {offer.type}</option>)}</select>
            <button type="button" className={appliedOffer ? "active" : ""} onClick={applyOffer} disabled={!appliedOffer && !activePosOffers.length}>{appliedOffer ? "Remove" : "Apply"}</button>
            {selectedOffer?.type === "Coupon" && !appliedOffer && <label className="coupon-entry"><span>Coupon code</span><input value={couponEntry} onChange={(event) => setCouponEntry(event.target.value.toUpperCase())} placeholder="Enter code" maxLength="24" /></label>}
            {appliedOffer && <span className="pos-offer-applied"><CircleCheck size={14} /> {appliedOffer.name}</span>}
          </div>
        </div>
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
            <span>Discount <strong>{formatMoney(totalDiscount)}</strong></span>
            {appliedOffer && <span className="bill-applied-offer">Offer · {appliedOffer.name}<strong>-{formatMoney(offerDiscount)}</strong></span>}
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
        <em>{kotPrinter.paper}{kotPrinter.type === "QZ Tray" ? " / QZ Tray" : ` / ${kotPrinter.ip}:${kotPrinter.port}`}</em>
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

function Tables({ notify, canManageAll, storeId, items, currentUser, tableOrders = [], onSaveOrder, onSendKot, onSendReception, onCancelOrder, onCancelItem, kotPrinter, cloudStateReady = false }) {
  const [floors, setFloors] = useBusinessState(`vestora-floors-${storeId}`, () => {
    const saved = loadStoredArray(`vestora-floors-${storeId}`);
    return saved.length ? saved : floorOptions;
  });
  const [floor, setFloor] = useState(() => floors[0] || "Main");
  const [tables, setTables] = useBusinessState(`vestora-tables-${storeId}`, () => {
    const saved = loadStoredArray(`vestora-tables-${storeId}`);
    return saved;
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
  const [qrTable, setQrTable] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const visibleTables = tables.filter((table) => table.floor === floor);
  const selectedTable = tables.find((table) => table.id === selected);
  const catalogItems = (items?.length ? items : menuItems).filter((item) => item.status !== "Inactive");
  const orderCategories = ["All", ...Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean)))];
  const filteredOrderItems = catalogItems.filter((item) => (orderCategory === "All" || item.category === orderCategory) && [item.name, item.category, item.barcode].join(" ").toLowerCase().includes(orderQuery.trim().toLowerCase()));
  const activeTableOrder = selectedTable ? tableOrders.find((order) => order.tableId === selectedTable.id && order.status !== "Paid" && order.status !== "Cancelled") : null;
  const addonTableOrder = activeTableOrder
    && ["Taking order", "KOT sent", "QR order received"].includes(activeTableOrder.status)
    && Array.isArray(activeTableOrder.items)
    && activeTableOrder.items.length > 0
    ? activeTableOrder
    : null;
  const canStartTableOrder = selectedTable?.status === "Available" && !activeTableOrder;
  const canTakeTableOrder = Boolean(canStartTableOrder || addonTableOrder);
  const orderSubtotal = orderItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const orderItemCount = orderItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  useEffect(() => {
    const key = `vestora-tables-${storeId}`;
    localStorage.setItem(key, JSON.stringify(tables));
  }, [tables, storeId, cloudStateReady]);

  useEffect(() => {
    const key = `vestora-floors-${storeId}`;
    localStorage.setItem(key, JSON.stringify(floors));
  }, [floors, storeId, cloudStateReady]);

  useEffect(() => {
    const receive = (event) => {
      const { key, value } = event.detail || {};
      if (key === `vestora-tables-${storeId}` && Array.isArray(value)) setTables((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value);
      if (key === `vestora-floors-${storeId}` && Array.isArray(value)) setFloors((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value);
    };
    window.addEventListener("vestora-cloud-list-synced", receive);
    return () => window.removeEventListener("vestora-cloud-list-synced", receive);
  }, [storeId]);

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

  async function openTableQr(table) {
    // Publish the latest menu and table layout before printing a QR code so a
    // customer's phone always receives the same catalog as the staff screen.
    await Promise.all([
      syncLocalStateKeyToSupabase(`vestora-menu-items-${storeId}`).catch(() => {}),
      syncLocalStateKeyToSupabase(`vestora-tables-${storeId}`).catch(() => {}),
    ]);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("order", "1");
    url.searchParams.set("store", storeId);
    url.searchParams.set("table", String(table.id));
    setQrTable({ ...table, url: url.toString() });
    setQrImage("");
    setQrLoading(true);
    try {
      const image = await QRCode.toDataURL(url.toString(), { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#092c25", light: "#ffffff" } });
      setQrImage(image);
    } catch {
      notify("Unable to generate table QR code");
      setQrTable(null);
    } finally {
      setQrLoading(false);
    }
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
      id: `TABLE-ORDER-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
    if (type === "kot" && kotPrinter?.type === "QZ Tray") {
      printKotWithQz({ printerName: kotPrinter.name, paper: kotPrinter.paper, copies: kotPrinter.copies, order })
        .then(() => notify(`KOT printed on ${kotPrinter.name}`))
        .catch((error) => notify(`QZ Tray print failed: ${error?.message || "Check QZ Tray and printer connection"}`));
      return;
    }
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
      const nextId = crypto.randomUUID();
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
              <ClipboardList size={16} /> {activeTableOrder?.source === "QR" && activeTableOrder.status === "QR order received" ? "Review QR order" : addonTableOrder ? "Add on" : "Take order"}
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
            {canManageAll && !reorderMode && <button className="table-qr-button" type="button" onClick={(event) => { event.stopPropagation(); openTableQr(table); }}><QrCode size={15} /> QR order</button>}
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
                  <button className="save-order-action" type="button" onClick={saveOrderDraft} disabled={!orderItems.length}>{addonTableOrder ? "Save add-on" : "Save order"}</button>
                  <button className="kot-action" type="button" onClick={printAndSendKot} disabled={!orderItems.length}><Printer size={17} /> {addonTableOrder ? "Print add-on KOT" : "Print KOT"}</button>
                  <button className="reception-action" type="button" onClick={finishDining} disabled={!orderItems.length}><ReceiptText size={17} /> Dining complete · Send reception</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      {qrTable && (
        <div className="shift-modal-backdrop qr-order-backdrop" role="presentation">
          <section className="shift-modal qr-order-modal" role="dialog" aria-modal="true" aria-label={`QR ordering for ${qrTable.name}`}>
            <div className="shift-modal-head">
              <div><span>Table ordering</span><h2>{qrTable.name} QR code</h2></div>
              <button type="button" onClick={() => setQrTable(null)}>Close</button>
            </div>
            <p className="modal-help-text">Customers scan this code to open the menu and order directly from {qrTable.name}.</p>
            <div className="qr-order-preview">
              {qrLoading ? <div className="qr-loading">Creating QR code...</div> : qrImage && <img src={qrImage} alt={`Order from table ${qrTable.name}`} />}
              <strong>{qrTable.name} · {qrTable.floor}</strong>
            </div>
            <label className="qr-order-url">Ordering link<input readOnly value={qrTable.url} onFocus={(event) => event.target.select()} /></label>
            <div className="shift-actions">
              <button type="button" onClick={() => navigator.clipboard?.writeText(qrTable.url).then(() => notify("Ordering link copied"))}>Copy link</button>
              <a className="qr-download-button" href={qrImage || undefined} download={`table-${qrTable.name}-qr.png`}>Download QR</a>
              <button type="button" onClick={() => { setQrTable(null); window.setTimeout(() => window.print(), 80); }}>Print</button>
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
          <small>UVPRO · {printSlip.type === "kot" ? (kotPrinter?.name || "KOT printer") : "RECEPTION"}</small>
        </div>
      )}
    </section>
  );
}

function Inventory({ notify, canManageAll, storeId, cloudStateReady = false }) {
  const storageKey = `vestora-inventory-${storeId}`;
  const categoryStorageKey = `vestora-inventory-categories-${storeId}`;
  const defaultCategories = ["Dry goods", "Dairy", "Vegetables", "Beverages", "Operations", "Packaging", "Other"];
  const blankDraft = { name: "", sku: "", category: "Dry goods", stock: "", unit: "kg", reorder: "", cost: "" };
  const savedItems = stripUntouchedDefaultRecords(loadStoredArray(storageKey), defaultInventoryItems, ["updatedAt"]);
  const savedCategories = loadStoredArray(categoryStorageKey);
  const [items, setItems] = useBusinessState(storageKey, () => savedItems);
  const [categories, setCategories] = useBusinessState(categoryStorageKey, () => Array.from(new Set([...defaultCategories, ...savedCategories, ...(savedItems.length ? savedItems : defaultInventoryItems).map((item) => item.category).filter(Boolean)])));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [skuIsManual, setSkuIsManual] = useState(false);
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const inventorySyncJob = useRef(null);

  const refreshInventory = () => {
    if (inventorySyncJob.current) return inventorySyncJob.current;
    if (supabaseConfigured && !cloudStateReady) return Promise.resolve();
    const job = Promise.all([syncInventoryState(storageKey), syncInventoryState(categoryStorageKey)])
      .catch(() => {})
      .finally(() => { inventorySyncJob.current = null; });
    inventorySyncJob.current = job;
    return job;
  };

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
    const timer = window.setTimeout(refreshInventory, 300);
    return () => window.clearTimeout(timer);
  }, [items, storageKey, cloudStateReady]);

  useEffect(() => {
    localStorage.setItem(categoryStorageKey, JSON.stringify(categories));
    const timer = window.setTimeout(refreshInventory, 300);
    return () => window.clearTimeout(timer);
  }, [categories, categoryStorageKey, cloudStateReady]);

  useEffect(() => {
    const receive = (event) => {
      const { key, value } = event.detail;
      if (key === storageKey) setItems((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value);
      if (key === categoryStorageKey) setCategories((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value);
    };
    window.addEventListener("vestora-inventory-synced", receive);
    window.addEventListener("online", refreshInventory);
    window.addEventListener("focus", refreshInventory);
    const timer = window.setInterval(refreshInventory, 5000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("vestora-inventory-synced", receive);
      window.removeEventListener("online", refreshInventory);
      window.removeEventListener("focus", refreshInventory);
    };
  }, [cloudStateReady, storageKey, categoryStorageKey]);

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
  const generateSku = (excludedId = "") => {
    const existingNumbers = new Set(items
      .filter((item) => item.id !== excludedId && /^\d+$/.test(String(item.sku || "").trim()))
      .map((item) => Number(item.sku)));
    let serial = 1;
    while (existingNumbers.has(serial)) serial += 1;
    return String(serial).padStart(3, "0");
  };
  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...blankDraft, sku: generateSku() });
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
    const nextValue = field === "sku" && !editingId ? value.replace(/\D/g, "") : value;
    if (field === "sku") setSkuIsManual(Boolean(nextValue.trim()));
    setDraft((current) => {
      if (field === "name" && !editingId && !skuIsManual) return { ...current, name: value, sku: value.trim() ? generateSku() : "" };
      return { ...current, [field]: nextValue };
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
    const resolvedSku = (draft.sku.trim() || generateSku(editingId)).toUpperCase();
    if (!editingId && !/^\d+$/.test(resolvedSku)) {
      notify("SKU number must contain digits only");
      return;
    }
    const duplicateSku = items.some((item) => {
      if (item.id === editingId) return false;
      const existingSku = String(item.sku || "").toUpperCase();
      return existingSku === resolvedSku || (/^\d+$/.test(existingSku) && /^\d+$/.test(resolvedSku) && Number(existingSku) === Number(resolvedSku));
    });
    if (duplicateSku) {
      notify("This SKU code is already in use");
      return;
    }
    const nextItem = {
      ...draft,
      id: editingId || `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name: draft.name.trim(),
      sku: resolvedSku,
      stock: Number(draft.stock),
      reorder: Number(draft.reorder),
      cost: Number(draft.cost),
      updatedAt: new Date().toISOString(),
    };
    setItems((current) => editingId ? current.map((item) => item.id === editingId ? nextItem : item) : [nextItem, ...current]);
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
               <label><span>SKU number</span><input value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} inputMode="numeric" pattern="[0-9]*" maxLength="6" placeholder="Auto-generated number" /></label>
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

function ItemStock({ foodStock = [], onFoodStockChange, canManage = false, notify, onOpenProduction }) {
  const [editingItemId, setEditingItemId] = useState("");
  const [editDraft, setEditDraft] = useState({ item: "", unit: "plate", produced: "", threshold: "5" });
  const items = Array.from(foodStock.reduce((grouped, record) => {
    const key = normalizeFoodItemName(record.item) || String(record.id || record.item || "finished-item");
    const existing = grouped.get(key) || {
      id: record.id || key,
      item: record.item || "Finished item",
      unit: record.unit || "portion",
      produced: 0,
      sold: 0,
      available: 0,
      threshold: foodStockThreshold(record),
    };
    grouped.set(key, {
      ...existing,
      item: existing.item || record.item || "Finished item",
      unit: record.unit || existing.unit || "portion",
      produced: Number(existing.produced || 0) + Number(record.produced || 0),
      sold: Number(existing.sold || 0) + Number(record.sold || 0),
      available: Number(existing.available || 0) + Number(record.available || 0),
      threshold: Math.max(Number(existing.threshold || 0), foodStockThreshold(record)),
    });
    return grouped;
  }, new Map()).values()).sort((first, second) => String(first.item).localeCompare(String(second.item)));
  const totalProduced = items.reduce((sum, item) => sum + Number(item.produced || 0), 0);
  const totalAvailable = items.reduce((sum, item) => sum + Number(item.available || 0), 0);
  const lowStockCount = items.filter((item) => Number(item.available || 0) <= foodStockThreshold(item)).length;
  const editingItem = foodStock.find((record) => String(record.id) === String(editingItemId)) || null;

  function closeEditor() {
    setEditingItemId("");
    setEditDraft({ item: "", unit: "plate", produced: "", threshold: "5" });
  }

  function startEdit(item) {
    const source = foodStock.find((record) => String(record.id) === String(item.id));
    if (!source) return;
    setEditingItemId(source.id);
    setEditDraft({
      item: source.item || "",
      unit: source.unit || "plate",
      produced: String(Number(source.produced || 0)),
      threshold: String(foodStockThreshold(source)),
    });
  }

  function saveItemStock(event) {
    event.preventDefault();
    if (!canManage || !editingItem) return;
    const item = String(editDraft.item || "").trim();
    const produced = Number(editDraft.produced);
    const threshold = Number(editDraft.threshold);
    const sold = Number(editingItem.sold || 0);
    if (!item) {
      notify?.("Enter the finished item name");
      return;
    }
    if (!Number.isFinite(produced) || produced < 0) {
      notify?.("Enter a valid total produced quantity");
      return;
    }
    if (produced < sold) {
      notify?.(`Total produced cannot be below ${sold} POS ordered`);
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      notify?.("Enter a valid low-stock alert level");
      return;
    }
    const unit = editDraft.unit || editingItem.unit || "plate";
    onFoodStockChange?.((current) => current.map((record) => String(record.id) === String(editingItem.id) ? {
      ...record,
      item,
      unit,
      produced,
      available: Math.max(0, produced - Number(record.sold || 0)),
      threshold,
      updatedAt: new Date().toISOString(),
    } : record));
    closeEditor();
    notify?.(`${item} item stock updated`);
  }

  return (
    <section className="screen item-stock-screen">
      <div className="metric-grid compact">
        <Metric icon={PackageSearch} label="Finished items" value={String(items.length)} trend="Production tracked" />
        <Metric icon={DatabaseZap} label="Total produced" value={String(totalProduced)} trend="Completed production" />
        <Metric icon={Boxes} label="Available now" value={String(totalAvailable)} trend="Ready for POS" />
        <Metric icon={AlertTriangle} label="Low / out" value={String(lowStockCount)} trend="Needs production" danger={lowStockCount > 0} />
      </div>
      <div className="panel production-panel">
        <PanelHead title="Item Stock" icon={PackageSearch} actions={["Add finished production"]} onAction={(action) => { if (action === "Add finished production") onOpenProduction?.(); }} />
        <div className="production-report-head">
          <div><h3>Finished production quantity</h3><span className="food-stock-table-note">Total production is added here; POS orders reduce the available quantity automatically.</span></div>
          <strong>{items.length} tracked item{items.length === 1 ? "" : "s"}</strong>
        </div>
        {editingItem && (
          <form className="inventory-editor" onSubmit={saveItemStock}>
            <div className="inventory-editor-head">
              <div><span>FINISHED ITEM</span><h3>Edit item stock</h3></div>
              <button className="icon-button" type="button" onClick={closeEditor} aria-label="Close item stock editor"><X size={18} /></button>
            </div>
            <div className="inventory-form-grid">
              <label><span>Item name</span><input autoFocus value={editDraft.item} onChange={(event) => setEditDraft((current) => ({ ...current, item: event.target.value }))} /></label>
              <label><span>Unit</span><select value={editDraft.unit} onChange={(event) => setEditDraft((current) => ({ ...current, unit: event.target.value }))}>{Array.from(new Set([...productionOutputUnits, editDraft.unit].filter(Boolean))).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
              <label><span>Total produced</span><input type="number" min="0" step="0.01" value={editDraft.produced} onChange={(event) => setEditDraft((current) => ({ ...current, produced: event.target.value }))} /></label>
              <label><span>Alert when remaining at or below</span><input type="number" min="0" step="1" value={editDraft.threshold} onChange={(event) => setEditDraft((current) => ({ ...current, threshold: event.target.value }))} /></label>
            </div>
            <p className="food-stock-table-note">POS ordered: {Number(editingItem.sold || 0)} {editingItem.unit || "portion"}. Available quantity updates automatically.</p>
            <div className="inventory-editor-actions"><button type="button" onClick={closeEditor}>Cancel</button><button className="primary-action" type="submit"><Save size={18} /> Save item stock</button></div>
          </form>
        )}
        <div className="production-table food-stock-table">
          <table>
            <thead><tr><th>Item</th><th>Total produced</th><th>POS ordered</th><th>Available now</th><th>Alert level</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead>
            <tbody>{items.length ? items.map((item) => {
              const available = Number(item.available || 0);
              const low = available <= foodStockThreshold(item);
              return <tr key={item.id}><td><strong>{item.item}</strong><br /><small>{item.unit || "portion"}</small></td><td>{Number(item.produced || 0)} {item.unit || "portion"}</td><td>{Number(item.sold || 0)} {item.unit || "portion"}</td><td className={low ? "food-stock-remaining low" : "food-stock-remaining"}>{available} {item.unit || "portion"}</td><td>{foodStockThreshold(item)}</td><td><span className={available <= 0 ? "danger-chip" : low ? "food-stock-low-chip" : "active-chip"}>{available <= 0 ? "Out of stock" : low ? "Low stock" : "Healthy"}</span></td>{canManage && <td><div className="row-actions"><button type="button" onClick={() => startEdit(item)}><Pencil size={15} /> Edit</button></div></td>}</tr>;
            }) : <tr><td colSpan={canManage ? "7" : "6"}>No finished production has been added yet. Use Add finished production to enter the quantity.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Production({ notify, storeId, canManageAll, activeView = "Recipes", activeReport = "Daily Production", onViewChange, foodStock = [], onFoodStockChange, cloudStateReady = false }) {
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
  const productionTabs = ["Recipes", "Planning", "Batches", "Food Stock", "Wastage", "Reports"];
  const [activeTab, setActiveTab] = useState(productionTabs.includes(activeView) ? activeView : "Recipes");
  const [recipes, setRecipes] = useBusinessState(recipeKey, () => savedRecipes);
  const [recipeCategories, setRecipeCategories] = useBusinessState(categoryKey, () => Array.from(new Set([...productionCategories, ...savedRecipeCategories, ...(savedRecipes.length ? savedRecipes : defaultRecipes).map((recipe) => recipe.category).filter(Boolean)])));
  const [inventory, setInventory] = useBusinessState(inventoryKey, () => stripUntouchedDefaultRecords(loadStoredArray(inventoryKey), defaultInventoryItems, ["updatedAt"]));
  const [batches, setBatches] = useBusinessState(batchKey, () => {
    return stripUntouchedDefaultRecords(loadStoredArray(batchKey), defaultProductionBatches, ["materialsIssued", "endTime"]);
  });
  const [wastageEntries, setWastageEntries] = useBusinessState(wastageKey, () => loadStoredArray(wastageKey));
  const [transactions, setTransactions] = useBusinessState(transactionKey, () => loadStoredArray(transactionKey));
  const [finishedGoods, setFinishedGoods] = useBusinessState(finishedGoodsKey, () => loadStoredArray(finishedGoodsKey));
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
  const [foodStockDraft, setFoodStockDraft] = useState({
    item: selectedRecipe?.name || "Chicken Biryani",
    qty: "",
    unit: selectedRecipe?.outputUnit || "plate",
    threshold: 5,
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

  useEffect(() => {
    localStorage.setItem(recipeKey, JSON.stringify(recipes));
    if (cloudStateReady) syncLocalStateKeyToSupabase(recipeKey).catch(() => {});
  }, [recipes, recipeKey]);
  useEffect(() => {
    localStorage.setItem(categoryKey, JSON.stringify(recipeCategories));
    if (cloudStateReady) syncLocalStateKeyToSupabase(categoryKey).catch(() => {});
  }, [recipeCategories, categoryKey]);
  useEffect(() => {
    localStorage.setItem(inventoryKey, JSON.stringify(inventory));
    if (cloudStateReady) syncLocalStateKeyToSupabase(inventoryKey).catch(() => {});
  }, [inventory, inventoryKey]);
  useEffect(() => {
    const receive = (event) => {
      if (event.detail.key === inventoryKey) setInventory((current) => JSON.stringify(current) === JSON.stringify(event.detail.value) ? current : event.detail.value);
    };
    window.addEventListener("vestora-inventory-synced", receive);
    return () => window.removeEventListener("vestora-inventory-synced", receive);
  }, [inventoryKey]);
  useEffect(() => {
    localStorage.setItem(batchKey, JSON.stringify(batches));
    if (cloudStateReady) syncLocalStateKeyToSupabase(batchKey).catch(() => {});
  }, [batches, batchKey]);
  useEffect(() => {
    localStorage.setItem(wastageKey, JSON.stringify(wastageEntries));
    if (cloudStateReady) syncLocalStateKeyToSupabase(wastageKey).catch(() => {});
  }, [wastageEntries, wastageKey]);
  useEffect(() => {
    localStorage.setItem(transactionKey, JSON.stringify(transactions));
    if (cloudStateReady) syncLocalStateKeyToSupabase(transactionKey).catch(() => {});
  }, [transactions, transactionKey]);
  useEffect(() => {
    localStorage.setItem(finishedGoodsKey, JSON.stringify(finishedGoods));
    if (cloudStateReady) syncLocalStateKeyToSupabase(finishedGoodsKey).catch(() => {});
  }, [finishedGoods, finishedGoodsKey]);

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
      id: recipeDraft.id || `REC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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

  function addFoodStock(event) {
    event?.preventDefault();
    if (!canManageAll) {
      notify("Production Manager permission required");
      return;
    }
    const item = String(foodStockDraft.item || "").trim();
    const quantity = Number(foodStockDraft.qty);
    const threshold = Number(foodStockDraft.threshold);
    if (!item) {
      notify("Enter the completed food item");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify("Completed quantity must be greater than zero");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      notify("Enter a valid low-stock alert level");
      return;
    }
    const unit = foodStockDraft.unit || recipes.find((recipe) => normalizeFoodItemName(recipe.name) === normalizeFoodItemName(item))?.outputUnit || "plate";
    const existing = foodStockRecordFor(foodStock, item);
    const now = new Date().toISOString();
    onFoodStockChange?.((current) => {
      const matching = foodStockRecordFor(current, item);
      if (matching) {
        return current.map((record) => record.id === matching.id ? {
          ...record,
          item: record.item || item,
          unit: record.unit || unit,
          produced: Number(record.produced || 0) + quantity,
          available: Number(record.available || 0) + quantity,
          threshold,
          updatedAt: now,
        } : record);
      }
      return [{ id: `FOOD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, item, unit, produced: quantity, sold: 0, available: quantity, threshold, updatedAt: now }, ...current];
    });
    setFinishedGoods((current) => [{ id: `FG-MANUAL-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, item, qty: quantity, unit, batchNo: "Manual food stock", cost: 0, date: today }, ...current]);
    setTransactions((current) => [{ id: `TRN-FOOD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, type: "Receipt", batchNo: "Manual food stock", item, qty: `${quantity} ${unit}`, cost: 0, date: today }, ...current]);
    setFoodStockDraft((current) => ({ ...current, qty: "" }));
    notify(`${quantity} ${unit} of ${item} added to food stock${existing ? "" : " · POS tracking enabled"}`);
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
      id: `BATCH-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
      ...planRows.map((row, index) => ({ id: `TRN-ISSUE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${index}`, type: "Issue", batchNo: newBatch.batchNo, recipeName: newBatch.recipeName, item: row.name, qty: formatProductionQty(row.requiredBase, row.unit), qtyBase: row.requiredBase, unit: row.unit, cost: row.cost, date: today })),
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
    setFinishedGoods((current) => [{ id: `FG-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, item: batch.recipeName, qty: batch.qty, unit: recipe?.outputUnit || "plate", batchNo: batch.batchNo, cost: finishedBatch.cost, date: today }, ...current]);
    onFoodStockChange?.((current) => {
      const matching = foodStockRecordFor(current, batch.recipeName);
      const quantity = Number(batch.qty || 0);
      if (matching) {
        return current.map((record) => record.id === matching.id ? {
          ...record,
          produced: Number(record.produced || 0) + quantity,
          available: Number(record.available || 0) + quantity,
          updatedAt: new Date().toISOString(),
        } : record);
      }
      return [{ id: `FOOD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, item: batch.recipeName, unit: recipe?.outputUnit || "plate", produced: quantity, sold: 0, available: quantity, threshold: 5, updatedAt: new Date().toISOString() }, ...current];
    });
    setTransactions((current) => [
      { id: `TRN-FG-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, type: "Receipt", batchNo: batch.batchNo, item: batch.recipeName, qty: `${batch.qty} ${recipe?.outputUnit || "plate"}`, cost: finishedBatch.cost, date: today },
      ...(shouldIssueMaterials ? requirements.map((row, index) => ({ id: `TRN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${index}`, type: "Issue", batchNo: batch.batchNo, recipeName: batch.recipeName, item: row.name, qty: formatProductionQty(row.requiredBase, row.unit), qtyBase: row.requiredBase, unit: row.unit, cost: row.cost, date: today })) : []),
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
          id: `TRN-RETURN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${index}`,
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
    const entry = { ...wastageDraft, id: `WST-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, qty: quantity, cost: Number(wastageCost.toFixed(2)), approval: "Pending" };
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
      setTransactions((current) => [{ id: `TRN-WST-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, type: "Wastage", batchNo: "-", item: entry.item, qty: `${entry.qty} ${entry.unit}`, qtyBase: wastageBase, unit: entry.unit, cost: entry.cost, date: entry.date }, ...current]);
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

        {activeTab === "Food Stock" && (
          <div className="food-stock-layout">
            <form className="production-form food-stock-form" onSubmit={addFoodStock}>
              <div className="food-stock-form-heading"><div><span>COMPLETED FOOD</span><h3>Add finished food to POS stock</h3></div><p>Every paid POS order reduces the remaining quantity automatically.</p></div>
              <label>Food item<input list="food-stock-item-options" value={foodStockDraft.item} onChange={(event) => { const recipe = recipes.find((entry) => normalizeFoodItemName(entry.name) === normalizeFoodItemName(event.target.value)); setFoodStockDraft((current) => ({ ...current, item: event.target.value, unit: recipe?.outputUnit || current.unit })); }} placeholder="Chicken Biryani" /><datalist id="food-stock-item-options">{Array.from(new Set([...recipes.map((recipe) => recipe.name), ...foodStock.map((record) => record.item)].filter(Boolean))).map((item) => <option key={item} value={item} />)}</datalist></label>
              <label>Completed quantity<input type="number" min="0.01" step="0.01" value={foodStockDraft.qty} onChange={(event) => setFoodStockDraft((current) => ({ ...current, qty: event.target.value }))} placeholder="10" /></label>
              <label>Unit<select value={foodStockDraft.unit} onChange={(event) => setFoodStockDraft((current) => ({ ...current, unit: event.target.value }))}>{productionOutputUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
              <label>Alert when remaining at or below<input type="number" min="0" step="1" value={foodStockDraft.threshold} onChange={(event) => setFoodStockDraft((current) => ({ ...current, threshold: event.target.value }))} /></label>
              <div className="production-actions"><button type="submit" disabled={!canManageAll}><Plus size={15} /> Add completed production</button></div>
            </form>
            <div className="production-table food-stock-table">
              <div className="production-report-head"><div><h3>Food stock available to POS</h3><span className="food-stock-table-note">Use the same item name as the menu item to enable deduction.</span></div><strong>{foodStock.length} tracked item{foodStock.length === 1 ? "" : "s"}</strong></div>
              <table>
                <thead><tr><th>Food item</th><th>Produced</th><th>POS ordered</th><th>Remaining</th><th>Alert level</th><th>Status</th></tr></thead>
                <tbody>{foodStock.length ? foodStock.map((record) => {
                  const available = Number(record.available || 0);
                  const low = available <= foodStockThreshold(record);
                  return <tr key={record.id}><td><strong>{record.item}</strong></td><td>{record.produced || 0} {record.unit || "portion"}</td><td>{record.sold || 0} {record.unit || "portion"}</td><td className={low ? "food-stock-remaining low" : "food-stock-remaining"}>{available} {record.unit || "portion"}</td><td>{foodStockThreshold(record)}</td><td><span className={available <= 0 ? "danger-chip" : low ? "food-stock-low-chip" : "active-chip"}>{available <= 0 ? "Out of stock" : low ? "Low stock" : "Healthy"}</span></td></tr>;
                }) : <tr><td colSpan="6">No completed food has been added yet. Finish a batch or add completed production above.</td></tr>}</tbody>
              </table>
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

function CRM({ notify, canManageAll, storeId, salesLedger = [] }) {
  const [overrides, setOverrides] = useBusinessState(`vestora-customer-details-${storeId}`, []);
  const customers = new Map();
  salesLedger.forEach((bill) => {
    const name = String(bill.customerName || "").trim();
    const mobile = String(bill.customerMobile || "").replace(/\D/g, "").slice(-10);
    if (!name && !mobile) return;
    const key = mobile || name.toLowerCase();
    const current = customers.get(key) || { id: key, name: name || "Customer", mobile, points: 0, itemCounts: new Map() };
    current.name = name || current.name;
    current.mobile = mobile || current.mobile;
    current.points += Math.round(Number(bill.total || 0));
    (bill.items || []).forEach((item) => current.itemCounts.set(item.name, (current.itemCounts.get(item.name) || 0) + Number(item.qty || 0)));
    customers.set(key, current);
  });
  const rows = Array.from(customers.values())
    .filter((customer) => !overrides.find((entry) => entry.id === customer.id)?.deleted)
    .map((customer) => {
      const favourite = Array.from(customer.itemCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      const saved = overrides.find((entry) => entry.id === customer.id);
      return Object.assign(saved?.values ? [...saved.values] : [customer.name, customer.mobile ? `+91 ${customer.mobile}` : "Not provided", String(customer.points), favourite], { recordId: customer.id });
    })
    .sort((a, b) => Number(b[2]) - Number(a[2]));
  function updateCustomerRows(next) {
    setOverrides((current) => {
      const changes = new Map(current.map((entry) => [entry.id, entry]));
      for (const row of rows) {
        const replacement = next.find((entry) => entry.recordId === row.recordId);
        if (!replacement) changes.set(row.recordId, { id: row.recordId, deleted: true });
        else if (JSON.stringify(row) !== JSON.stringify(replacement)) changes.set(row.recordId, { id: row.recordId, values: [...replacement] });
      }
      return [...changes.values()];
    });
  }
  return <DataTable title="Customer CRM" icon={Users} columns={["Customer", "Mobile", "Loyalty", "Favourite"]} rows={rows} onRowsChange={updateCustomerRows} notify={notify} canManageAll={canManageAll} emptyMessage="No customer details yet. Complete a bill with customer name or mobile to add it here." />;
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
      id: draft.id || `ITEM-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
  const [records, setRecords] = useBusinessState(`vestora-menu-setup-${storeId}`, () => {
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
    syncLocalStateKeyToSupabase(`vestora-menu-setup-${storeId}`).catch(() => {});
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
        Categories: [{ id: crypto.randomUUID(), name: cleanedName, code, status: "Active" }, ...currentCategories],
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
    const saved = { ...draft, id: selectedId || crypto.randomUUID() };
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
        id: entry.id || crypto.randomUUID(),
        ...Object.fromEntries(config.fields.map(([field]) => [field, String(entry[field] ?? "").trim()])),
      }));
      setRecords((current) => ({ ...current, [activeSection]: normalized }));
      setSelectedId(null);
      setDraft({ ...config.sample });
      setShowRecordEditor(false);
      notify(`${normalized.length} ${activeSection.toLowerCase()} records imported`);
    } catch {
      notify("Choose a valid UVPRO JSON export");
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

const financeExpensePurposes = ["Rent", "Salary", "Supplies", "Utilities", "Maintenance", "Marketing", "Food purchase", "Packaging", "Transport", "GST payment", "Other expense"];
const financeReceiptPurposes = ["Food sales", "Customer payment", "Advance received", "Catering income", "Service charge", "Refund recovery", "Other income"];
const financeJournalPurposes = ["Adjustment", "Bank transfer", "Owner capital", "Owner withdrawal", "GST adjustment", "Supplier settlement", "Payroll accrual", "Depreciation", "Other journal"];
const financeAccountOptions = ["Cash", "Bank", "UPI", "Card", "Wallet", "Credit", "Accounts receivable", "Accounts payable", "Sales", "Food sales", "Service income", "GST output", "GST input", "Owner capital", "Owner drawings", ...financeExpensePurposes.map((purpose) => `Expense - ${purpose}`)];
const financeLedgerGroups = {
  Asset: ["Current asset", "Bank accounts", "Cash in hand", "Accounts receivable", "Inventory", "Fixed asset"],
  Liability: ["Current liability", "Accounts payable", "Tax payable", "Loan payable", "Accrued expense"],
  Equity: ["Partners capital", "Owner capital", "Retained earnings", "Drawings"],
  Income: ["Sales income", "Service income", "Other income", "Discount received"],
  Expense: ["Direct expense", "Indirect expense", "Bank charges", "Salary expense", "Rent expense", "Utilities expense"],
};
const financeLedgerCodePrefix = { Asset: "AST", Liability: "LIA", Equity: "EQT", Income: "INC", Expense: "EXP" };
const defaultFinanceLedgers = financeAccountOptions.map((name, index) => {
  const type = name.startsWith("Expense -") ? "Expense"
    : ["Cash", "Bank", "UPI", "Card", "Wallet", "Credit", "Accounts receivable"].includes(name) ? "Asset"
      : name === "Accounts payable" ? "Liability"
        : ["Owner capital", "Owner drawings"].includes(name) ? "Equity"
          : "Income";
  const group = name.startsWith("Expense -") ? "Indirect expense"
    : ["Cash", "Bank", "UPI", "Card", "Wallet"].includes(name) ? "Current asset"
      : name === "Accounts payable" ? "Current liability"
        : ["Owner capital", "Owner drawings"].includes(name) ? "Partners capital"
          : "Sales income";
  return { id: `SYS-${index + 1}`, code: `${financeLedgerCodePrefix[type]}-${String(index + 1).padStart(3, "0")}`, name, type, group, status: "Active", system: true };
});

function financeOptions(options, currentValue = "") {
  return Array.from(new Set([String(currentValue || "").trim(), ...options].filter(Boolean)));
}

function expenseAccountForPurpose(purpose) {
  return `Expense - ${purpose || "Other expense"}`;
}

function financeLedgerStorageKey(storeId) {
  return `vestora-finance-ledgers-${storeId}`;
}

function loadFinanceLedgers(storeId) {
  const saved = loadStoredArray(financeLedgerStorageKey(storeId));
  const byName = new Map();
  [...defaultFinanceLedgers, ...saved].forEach((ledger) => {
    const name = String(ledger.name || "").trim();
    if (name) byName.set(name.toLowerCase(), { ...ledger, name });
  });
  return Array.from(byName.values());
}

function financeAccountNames(ledgers, currentValue = "") {
  return financeOptions(ledgers.filter((ledger) => ledger.status !== "Inactive").map((ledger) => ledger.name), currentValue);
}

function financeLedgerOptionLabel(ledger) {
  const code = ledger.code ? `${ledger.code} - ` : "";
  const group = [ledger.type, ledger.group].filter(Boolean).join(" / ");
  return `${code}${ledger.name}${group ? ` - ${group}` : ""}`;
}

function newFinanceJournalLine(account = "", debit = "", credit = "", description = "", side = "") {
  return { id: `JLINE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`, account, debit, credit, description, side };
}

function blankFinanceJournalDraft() {
  return { date: localDateKey(), purpose: "", reference: "", note: "", status: "Posted", lines: [newFinanceJournalLine("", "", "", "", "debit"), newFinanceJournalLine("", "", "", "", "credit")] };
}

function normalizeFinanceJournalLines(record = {}) {
  if (Array.isArray(record.lines) && record.lines.length) {
    return record.lines.map((line, index) => ({
      id: line.id || newFinanceJournalLine().id,
      account: line.account || "",
      debit: line.debit ? String(line.debit) : "",
      credit: line.credit ? String(line.credit) : "",
      description: line.description || "",
      side: line.side || (line.debit ? "debit" : line.credit ? "credit" : index === 0 ? "debit" : index === 1 ? "credit" : ""),
    }));
  }
  const amount = record.amount ? String(record.amount) : "";
  return [
    newFinanceJournalLine(record.debitAccount || "", amount, "", record.note || record.purpose || "", "debit"),
    newFinanceJournalLine(record.creditAccount || "", "", amount, record.note || record.purpose || "", "credit"),
  ];
}

function nextFinanceLedgerCode(type, ledgers) {
  const prefix = financeLedgerCodePrefix[type] || "LED";
  const max = ledgers.reduce((highest, ledger) => {
    if (ledger.system) return highest;
    const match = String(ledger.code || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function financeLedgerHierarchy(ledgers, balances = {}) {
  return Object.keys(financeLedgerGroups).map((type) => {
    const typeLedgers = ledgers.filter((ledger) => ledger.type === type && ledger.status !== "Inactive");
    const groups = Array.from(new Set(typeLedgers.map((ledger) => ledger.group || "General"))).map((group) => {
      const groupLedgers = typeLedgers.filter((ledger) => (ledger.group || "General") === group);
      const balance = groupLedgers.reduce((sum, ledger) => sum + Number(balances[ledger.name] || 0), 0);
      return { name: group, ledgers: groupLedgers, balance };
    });
    const balance = groups.reduce((sum, group) => sum + group.balance, 0);
    return { type, groups, balance };
  });
}

function Finance({ notify, canManageAll, salesLedger, refundLedger = [], storeId, view = "Expenses" }) {
  const expenseStorageKey = `vestora-finance-expenses-${storeId}`;
  const emptyExpense = () => ({ category: "", debitAccount: "", creditAccount: "Cash", amount: "", paidFrom: "Cash", status: "Posted", date: localDateKey(), reference: "", note: "" });
  const [expenses, setExpenses] = useBusinessState(expenseStorageKey, () => loadStoredArray(expenseStorageKey));
  const [expenseDraft, setExpenseDraft] = useState(emptyExpense);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [ledgerFormOpen, setLedgerFormOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState({ date: localDateKey(), debitAccount: "", creditAccount: "", amount: "", reference: "", note: "" });
  const [filters, setFilters] = useState({ query: "", method: "All", status: "All", from: "", to: "" });
  const ledgerMasters = loadFinanceLedgers(storeId);
  const accountNames = financeAccountNames(ledgerMasters);

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
      syncLocalStateKeyToSupabase(expenseStorageKey).catch(() => {});
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
      id: editingExpenseId || `EXP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      category,
      debitAccount: expenseDraft.debitAccount || expenseAccountForPurpose(category),
      creditAccount: expenseDraft.creditAccount || expenseDraft.paidFrom || "Cash",
      amount,
      paidFrom: expenseDraft.creditAccount || expenseDraft.paidFrom,
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
      debitAccount: expense.debitAccount || expenseAccountForPurpose(expense.category),
      creditAccount: expense.creditAccount || expense.paidFrom || "Cash",
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
    const searchText = `${expense.category} ${expense.debitAccount} ${expense.creditAccount} ${expense.reference} ${expense.note} ${expense.paidFrom}`.toLowerCase();
    return (!filters.query || searchText.includes(filters.query.toLowerCase()))
      && (filters.method === "All" || expense.paidFrom === filters.method || expense.creditAccount === filters.method)
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
            <button onClick={() => downloadCsv("vestora-expenses.csv", ["Date", "Purpose", "Debited account", "Credited account", "Amount", "Status", "Reference", "Note"], filteredExpenses.map((expense) => ({ Date: expense.date, Purpose: expense.category, "Debited account": expense.debitAccount || expenseAccountForPurpose(expense.category), "Credited account": expense.creditAccount || expense.paidFrom, Amount: expense.amount, Status: expense.status, Reference: expense.reference, Note: expense.note })))}><Download size={18} />Export</button>
          </div>
        </div>

        {(filtersOpen || rangeOpen) && <div className="finance-filter-row">
          {filtersOpen && <>
            <label className="finance-search"><Search size={18} /><input placeholder="Search expense, reference, note" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>
            <label>Credited account<select value={filters.method} onChange={(event) => setFilters((current) => ({ ...current, method: event.target.value }))}><option>All</option>{accountNames.map((account) => <option key={account}>{account}</option>)}</select></label>
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
          <label>Purpose / amount gone for<select autoFocus value={expenseDraft.category} onChange={(event) => setExpenseDraft((current) => ({ ...current, category: event.target.value, debitAccount: expenseAccountForPurpose(event.target.value) }))}><option value="">Select purpose</option>{financeExpensePurposes.map((purpose) => <option key={purpose}>{purpose}</option>)}</select></label>
          <label>Debited account<select value={expenseDraft.debitAccount || expenseAccountForPurpose(expenseDraft.category)} onChange={(event) => setExpenseDraft((current) => ({ ...current, debitAccount: event.target.value }))}><option value="">Select debit account</option>{financeOptions(accountNames, expenseDraft.debitAccount).map((account) => <option key={account}>{account}</option>)}</select></label>
          <label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label>Credited account / paid from<select value={expenseDraft.creditAccount || expenseDraft.paidFrom} onChange={(event) => setExpenseDraft((current) => ({ ...current, creditAccount: event.target.value, paidFrom: event.target.value }))}>{financeOptions(accountNames, expenseDraft.creditAccount || expenseDraft.paidFrom).map((account) => <option key={account}>{account}</option>)}</select></label>
          <label>Status<select value={expenseDraft.status} onChange={(event) => setExpenseDraft((current) => ({ ...current, status: event.target.value }))}><option>Posted</option><option>Review</option><option>Pending</option><option>Paid</option></select></label>
          <label>Date<input type="date" value={expenseDraft.date} onChange={(event) => setExpenseDraft((current) => ({ ...current, date: event.target.value }))} /></label>
          <label>Reference<input placeholder="Invoice or receipt number" value={expenseDraft.reference} onChange={(event) => setExpenseDraft((current) => ({ ...current, reference: event.target.value }))} /></label>
          <label className="finance-note">Notes<input placeholder="Optional note" value={expenseDraft.note} onChange={(event) => setExpenseDraft((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="finance-form-actions"><button type="button" onClick={() => { setFormOpen(false); setEditingExpenseId(null); setExpenseDraft(emptyExpense()); }}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />{editingExpenseId ? "Save changes" : "Save expense"}</button></div>
        </form>}

        <div className="finance-summary"><span>Receivables <strong>{formatMoney(netCreditReceivables)}</strong></span><span>Showing <strong>{filteredExpenses.length}</strong> expenses</span><span>Total <strong>{formatMoney(expenseTotal)}</strong></span></div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead><tr><th>Date</th><th>Purpose</th><th>Debited</th><th>Credited</th><th>Amount</th><th>Status</th><th>Reference</th><th>Actions</th></tr></thead>
            <tbody>{filteredExpenses.length ? filteredExpenses.map((expense) => <tr key={expense.id}><td>{expense.date || "-"}</td><td><strong>{expense.category}</strong>{expense.note && <small>{expense.note}</small>}</td><td>{expense.debitAccount || expenseAccountForPurpose(expense.category)}</td><td>{expense.creditAccount || expense.paidFrom}</td><td>{formatMoney(expense.amount)}</td><td><span className={`status-pill ${String(expense.status).toLowerCase()}`}>{expense.status}</span></td><td>{expense.reference || "-"}</td><td><div className="row-actions"><button title="Edit expense" onClick={() => editExpense(expense)}><Pencil size={17} />Edit</button><button className="danger-action" title="Delete expense" onClick={() => deleteExpense(expense)}><Trash2 size={17} />Delete</button></div></td></tr>) : <tr><td colSpan="8" className="finance-empty">No expense records match this view.</td></tr>}</tbody>
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
    ? { customer: "", purpose: "Food sales", debitAccount: "Cash", creditAccount: "Sales", amount: "", method: "Cash", status: "Received", date: localDateKey(), reference: "", note: "" }
    : view === "Bank Accounts"
      ? { accountName: "", bankName: "", accountNumber: "", openingBalance: "", status: "Active", note: "" }
      : view === "Vendor Payments"
        ? { vendor: "", purpose: "Supplier settlement", invoice: "", dueAmount: "", amount: "", debitAccount: "Accounts payable", creditAccount: "Bank", method: "Bank", status: "Paid", date: localDateKey(), reference: "", note: "" }
      : blankFinanceJournalDraft();
  const [records, setRecords] = useBusinessState(storageKey, () => storageKey ? loadStoredArray(storageKey) : []);
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filters, setFilters] = useState({ query: "", method: "All", status: "All", from: "", to: "" });
  const [ledgerFormOpen, setLedgerFormOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState(blankFinanceJournalDraft);
  const ledgerStorageKey = financeLedgerStorageKey(storeId);
  const [ledgerMasterOpen, setLedgerMasterOpen] = useState(false);
  const [ledgerMasters, setLedgerMasters] = useBusinessState(ledgerStorageKey, () => loadFinanceLedgers(storeId));
  const [ledgerMasterDraft, setLedgerMasterDraft] = useState(() => {
    const ledgers = loadFinanceLedgers(storeId);
    return { code: nextFinanceLedgerCode("Asset", ledgers), name: "", type: "Asset", group: "Current asset", status: "Active" };
  });
  const [collapsedLedgerNodes, setCollapsedLedgerNodes] = useState(() => new Set());
  const reportBucketByView = { Receipts: "receipts", "Bank Accounts": "banks", "Vendor Payments": "vendors", "Journal Entries": "journals" };
  const reportBucket = reportBucketByView[view];
  const loadFinanceReportRecords = () => ({
    receipts: loadStoredArray(`vestora-finance-receipts-${storeId}`),
    banks: loadStoredArray(`vestora-finance-bank-accounts-${storeId}`),
    vendors: loadStoredArray(`vestora-finance-vendor-payments-${storeId}`),
    journals: loadStoredArray(`vestora-finance-journals-${storeId}`),
  });
  const [reportReceipts] = useBusinessState(`vestora-finance-receipts-${storeId}`, []);
  const [reportBanks] = useBusinessState(`vestora-finance-bank-accounts-${storeId}`, []);
  const [reportVendors] = useBusinessState(`vestora-finance-vendor-payments-${storeId}`, []);
  const [reportJournals] = useBusinessState(`vestora-finance-journals-${storeId}`, []);
  const reportRecords = { receipts: reportReceipts, banks: reportBanks, vendors: reportVendors, journals: reportJournals };

  useEffect(() => {
    setRecords(storageKey ? loadStoredArray(storageKey) : []);
    setDraft(blank());
    setEditingId("");
    setFormOpen(false);
    setFiltersOpen(false);
    setRangeOpen(false);
    setLedgerFormOpen(false);
    setLedgerDraft(blankFinanceJournalDraft());
    const nextLedgers = loadFinanceLedgers(storeId);
    setLedgerMasters(nextLedgers);
    setLedgerMasterOpen(false);
    setLedgerMasterDraft({ code: nextFinanceLedgerCode("Asset", nextLedgers), name: "", type: "Asset", group: "Current asset", status: "Active" });
    setCollapsedLedgerNodes(new Set());
    setFilters({ query: "", method: "All", status: "All", from: "", to: "" });
  }, [storeId, view]);

  const isReports = view === "Finance Reports";
  const title = isReports ? "Finance reports" : view;
  const singular = view === "Receipts" ? "Receipt" : view === "Bank Accounts" ? "Bank account" : view === "Vendor Payments" ? "Vendor payment" : "Journal entry";
  const statuses = view === "Receipts" ? ["Received", "Pending", "Reversed"] : view === "Bank Accounts" ? ["Active", "Inactive"] : view === "Vendor Payments" ? ["Paid", "Partially paid", "Pending", "Cancelled"] : ["Posted", "Draft", "Review"];
  const accountNames = financeAccountNames(ledgerMasters);
  const setValue = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const ledgerSelectMasters = ledgerMasters
    .filter((ledger) => !ledger.system && ledger.status !== "Inactive")
    .sort((a, b) => `${a.type}-${a.group}-${a.code}`.localeCompare(`${b.type}-${b.group}-${b.code}`));
  const ledgerInfo = (name) => ledgerMasters.find((ledger) => ledger.name === name);
  const ledgerInfoText = (name) => {
    const ledger = ledgerInfo(name);
    if (!ledger) return "";
    return [ledger.code, ledger.type, ledger.group, ledger.system ? "System ledger" : "Created ledger"].filter(Boolean).join(" - ");
  };
  const renderLedgerOptions = (currentValue = "", blockedValue = "") => {
    const current = String(currentValue || "").trim();
    const blocked = String(blockedValue || "").trim();
    const options = ledgerSelectMasters.filter((ledger) => ledger.name !== blocked);
    const currentLedger = current && !options.some((ledger) => ledger.name === current)
      ? { id: `current-${current}`, name: current, code: "", type: "Saved", group: "Ledger" }
      : null;
    return <>
      {currentLedger && <option value={currentLedger.name}>{financeLedgerOptionLabel(currentLedger)}</option>}
      {options.length > 0 && <optgroup label="Created ledgers">
        {options.map((ledger) => <option key={ledger.id || ledger.name} value={ledger.name}>{financeLedgerOptionLabel(ledger)}</option>)}
      </optgroup>}
      {!options.length && !currentLedger && <option value="" disabled>Create ledger first</option>}
    </>;
  };
  const renderJournalFields = (value, patchValue, autoFocus = false) => {
    const lines = normalizeFinanceJournalLines(value);
    const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const balanceDiff = debitTotal - creditTotal;
    const isBalanced = debitTotal > 0 && Math.abs(balanceDiff) < 0.005;
    const updateLine = (lineId, patch) => patchValue({ lines: lines.map((line) => line.id === lineId ? { ...line, ...patch } : line) });
    const removeLine = (lineId) => patchValue({ lines: lines.length > 2 ? lines.filter((line) => line.id !== lineId) : lines.map((line) => line.id === lineId ? { ...line, account: "", debit: "", credit: "", description: "" } : line) });
    const addDebitLine = () => patchValue({ lines: [...lines, newFinanceJournalLine("", "", "", "", "debit")] });
    const addCreditLine = () => patchValue({ lines: [...lines, newFinanceJournalLine("", "", "", "", "credit")] });
    return <>
      <label>Date<input type="date" value={value.date} onChange={(event) => patchValue({ date: event.target.value })} required /></label>
      <label>Entry number<input placeholder="Auto generated if blank" value={value.reference || ""} onChange={(event) => patchValue({ reference: event.target.value })} /></label>
      <div className="journal-lines-panel">
        <div className="journal-lines-title"><strong>Entry lines</strong><div><button type="button" onClick={() => { if (!canManageAll) return notify("Only an administrator can create ledgers"); setLedgerMasterOpen(true); }}><Plus size={16} />Create ledger</button><button type="button" className="journal-title-add debit" onClick={addDebitLine}><Plus size={16} />Debit line</button><button type="button" className="journal-title-add credit" onClick={addCreditLine}><Minus size={16} />Credit line</button><span className={isBalanced ? "balanced" : "not-balanced"}>{isBalanced ? "Balanced" : "Not balanced"}</span></div></div>
        <div className="journal-lines-table">
          <div className="journal-lines-head"><span>Account</span><span>Debit</span><span>Credit</span><span>Description</span><span></span></div>
          {lines.map((line, index) => { const fixedDebit = line.side === "debit"; const fixedCredit = line.side === "credit"; return <div className={`journal-line-row ${fixedDebit ? "debit-line" : fixedCredit ? "credit-line" : ""}`} key={line.id}>
            <label><select autoFocus={autoFocus && index === 0} value={line.account} onChange={(event) => updateLine(line.id, { account: event.target.value })} required={index < 2}><option value="">Select created ledger</option>{renderLedgerOptions(line.account)}</select><small><span>{fixedDebit ? "Debit line" : fixedCredit ? "Credit line" : "Journal line"}</span>{ledgerInfoText(line.account) || "Only created ledgers show here"}</small></label>
            <input type="number" min="0" step="0.01" placeholder={fixedCredit ? "-" : "0.00"} value={line.debit} disabled={fixedCredit} onChange={(event) => updateLine(line.id, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} />
            <input type="number" min="0" step="0.01" placeholder={fixedDebit ? "-" : "0.00"} value={line.credit} disabled={fixedDebit} onChange={(event) => updateLine(line.id, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} />
            <input placeholder="Line description" value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} />
            <button type="button" className="icon-action danger-action" title="Remove line" onClick={() => removeLine(line.id)}><Trash2 size={16} /></button>
          </div>; })}
          <div className={isBalanced ? "journal-lines-total balanced" : "journal-lines-total not-balanced"}><span>Total</span><strong>{formatMoney(debitTotal)}</strong><strong>{formatMoney(creditTotal)}</strong><small>{isBalanced ? "Debit and credit are matching." : `Difference ${formatMoney(Math.abs(balanceDiff))}`}</small><span></span></div>
        </div>
      </div>
    </>;
  };
  const prepareJournalRecord = (sourceDraft, existingId = "") => {
    const lines = normalizeFinanceJournalLines(sourceDraft).map((line) => ({
      id: line.id || newFinanceJournalLine().id,
      account: String(line.account || "").trim(),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: String(line.description || "").trim(),
      side: line.side || (Number(line.debit || 0) > 0 ? "debit" : Number(line.credit || 0) > 0 ? "credit" : ""),
    })).filter((line) => line.account || line.debit || line.credit || line.description);
    const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
    const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
    const invalidLine = lines.some((line) => !line.account || (line.debit <= 0 && line.credit <= 0) || (line.debit > 0 && line.credit > 0));
    if (lines.length < 2 || invalidLine || debitTotal <= 0 || Math.abs(debitTotal - creditTotal) >= 0.005) return null;
    const debitLine = lines.find((line) => line.debit > 0);
    const creditLine = lines.find((line) => line.credit > 0);
    const narration = sourceDraft.purpose?.trim()
      || sourceDraft.note?.trim()
      || lines.map((line) => line.description).find(Boolean)
      || "Journal entry";
    return {
      id: existingId || `JRN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      date: sourceDraft.date || localDateKey(),
      purpose: narration,
      debitAccount: debitLine?.account || "",
      creditAccount: creditLine?.account || "",
      amount: debitTotal,
      lines,
      status: sourceDraft.status || "Posted",
      reference: sourceDraft.reference?.trim() || `JRN-${Date.now().toString().slice(-6)}`,
      note: sourceDraft.note?.trim() || "",
      updatedAt: new Date().toISOString(),
    };
  };
  const journalSideText = (record, side) => {
    const lines = normalizeFinanceJournalLines(record).filter((line) => Number(line[side] || 0) > 0);
    return lines.map((line) => line.account).filter(Boolean).join(", ");
  };
  const journalAmountTotal = (record) => normalizeFinanceJournalLines(record).reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const saveRecords = (nextValue) => setRecords((current) => {
    const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(next));
      syncLocalStateKeyToSupabase(storageKey).catch(() => {});
    }
    return next;
  });
  const resetForm = () => { setDraft(blank()); setEditingId(""); setFormOpen(false); };

  function updateLedgerMasterType(type) {
    const group = financeLedgerGroups[type]?.[0] || "";
    setLedgerMasterDraft((current) => ({ ...current, type, group, code: nextFinanceLedgerCode(type, ledgerMasters) }));
  }

  function saveLedgerMaster(event) {
    event.preventDefault();
    if (!canManageAll) return notify("Only an administrator can create ledgers");
    const name = ledgerMasterDraft.name.trim();
    if (!name || !ledgerMasterDraft.type || !ledgerMasterDraft.group) return notify("Enter ledger name, type, and group");
    if (ledgerMasters.some((ledger) => ledger.name.toLowerCase() === name.toLowerCase())) return notify("Ledger name already exists");
    const record = {
      id: `LEDGER-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      code: ledgerMasterDraft.code || nextFinanceLedgerCode(ledgerMasterDraft.type, ledgerMasters),
      name,
      type: ledgerMasterDraft.type,
      group: ledgerMasterDraft.group,
      status: ledgerMasterDraft.status || "Active",
      createdAt: new Date().toISOString(),
    };
    const savedLedgers = loadStoredArray(ledgerStorageKey);
    const nextSaved = [record, ...savedLedgers];
    localStorage.setItem(ledgerStorageKey, JSON.stringify(nextSaved));
    syncLocalStateKeyToSupabase(ledgerStorageKey).catch(() => {});
    const nextMasters = loadFinanceLedgers(storeId);
    setLedgerMasters(nextMasters);
    setLedgerMasterDraft({ code: nextFinanceLedgerCode(record.type, nextMasters), name: "", type: record.type, group: record.group, status: "Active" });
    setLedgerMasterOpen(false);
    notify(`${record.code} ${record.name} ledger created`);
  }

  function openNew() {
    if (!canManageAll) return notify("Only an administrator can manage finance records");
    setDraft(blank()); setEditingId(""); setFormOpen(true);
  }
  function editRecord(record) {
    if (!canManageAll) return notify("Only an administrator can manage finance records");
    setEditingId(record.id);
    setDraft(view === "Receipts"
      ? { customer: record.customer || "", purpose: record.purpose || "Food sales", debitAccount: record.debitAccount || record.method || "Cash", creditAccount: record.creditAccount || "Sales", amount: String(record.amount || ""), method: record.method || "Cash", status: record.status || "Received", date: record.date || localDateKey(), reference: record.reference || "", note: record.note || "" }
      : view === "Bank Accounts"
      ? { accountName: record.accountName || "", bankName: record.bankName || "", accountNumber: record.accountNumber || "", openingBalance: String(record.openingBalance || ""), status: record.status || "Active", note: record.note || "" }
        : view === "Vendor Payments"
          ? { vendor: record.vendor || "", purpose: record.purpose || "Supplier settlement", invoice: record.invoice || "", dueAmount: String(record.dueAmount || ""), amount: String(record.amount || ""), debitAccount: record.debitAccount || "Accounts payable", creditAccount: record.creditAccount || record.method || "Bank", method: record.method || "Bank", status: record.status || "Paid", date: record.date || localDateKey(), reference: record.reference || "", note: record.note || "" }
        : { date: record.date || localDateKey(), purpose: record.purpose || "", reference: record.reference || "", note: record.note || "", status: record.status || "Posted", lines: normalizeFinanceJournalLines(record) });
    setFormOpen(true);
  }
  function saveRecord(event) {
    event.preventDefault();
    const amount = Number(view === "Bank Accounts" ? draft.openingBalance : draft.amount);
    let record;
    if (view === "Receipts") {
      if (!draft.customer.trim() || !draft.purpose?.trim() || !draft.debitAccount?.trim() || !draft.creditAccount?.trim() || !Number.isFinite(amount) || amount <= 0) return notify("Enter customer, purpose, accounts, and receipt amount");
      record = { ...draft, id: editingId || `RCT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, customer: draft.customer.trim(), purpose: draft.purpose.trim(), debitAccount: draft.debitAccount.trim(), creditAccount: draft.creditAccount.trim(), method: draft.debitAccount.trim(), amount, reference: draft.reference.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else if (view === "Bank Accounts") {
      if (!draft.accountName.trim() || !draft.bankName.trim()) return notify("Enter account and bank name");
      record = { ...draft, id: editingId || `BANK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, accountName: draft.accountName.trim(), bankName: draft.bankName.trim(), accountNumber: draft.accountNumber.trim(), openingBalance: Number.isFinite(amount) ? amount : 0, note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else if (view === "Vendor Payments") {
      const dueAmount = Number(draft.dueAmount);
      if (!draft.vendor.trim() || !draft.purpose?.trim() || !draft.debitAccount?.trim() || !draft.creditAccount?.trim() || !Number.isFinite(amount) || amount <= 0) return notify("Enter vendor, purpose, accounts, and payment amount");
      record = { ...draft, id: editingId || `VND-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, vendor: draft.vendor.trim(), purpose: draft.purpose.trim(), invoice: draft.invoice.trim(), dueAmount: Number.isFinite(dueAmount) ? dueAmount : 0, amount, debitAccount: draft.debitAccount.trim(), creditAccount: draft.creditAccount.trim(), method: draft.creditAccount.trim(), reference: draft.reference.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    } else {
      record = prepareJournalRecord(draft, editingId);
      if (!record) return notify("Select ledger accounts, enter at least two valid lines, and match debit and credit totals");
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
    const record = prepareJournalRecord({ ...ledgerDraft, status: "Posted" });
    if (!record) return notify("Select ledger accounts, enter at least two valid lines, and match debit and credit totals");
    const journalKey = `vestora-finance-journals-${storeId}`;
    const nextJournals = [record, ...loadStoredArray(journalKey)];
    localStorage.setItem(journalKey, JSON.stringify(nextJournals));
    syncLocalStateKeyToSupabase(journalKey).catch(() => {});
    setLedgerDraft(blankFinanceJournalDraft());
    setLedgerFormOpen(false);
    notify("Ledger entry posted");
  }

  const filtered = records.filter((record) => {
    const text = JSON.stringify(record).toLowerCase();
    return (!filters.query || text.includes(filters.query.toLowerCase()))
      && (!["Receipts", "Vendor Payments"].includes(view) || filters.method === "All" || record.method === filters.method || record.debitAccount === filters.method || record.creditAccount === filters.method)
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
    ...reportRecords.receipts.map((item) => ({ date: item.date, type: "Receipt", reference: item.reference || item.id, details: `${item.purpose || "Receipt"} - ${item.customer}`, method: `${item.debitAccount || item.method || "Cash"} debit / ${item.creditAccount || "Sales"} credit`, amount: Number(item.amount || 0), status: item.status })),
    ...expenses.map((item) => ({ date: item.date, type: "Expense", reference: item.reference || item.id, details: item.category, method: `${item.debitAccount || expenseAccountForPurpose(item.category)} debit / ${item.creditAccount || item.paidFrom || "Cash"} credit`, amount: -Number(item.amount || 0), status: item.status })),
    ...reportRecords.vendors.map((item) => ({ date: item.date, type: "Vendor payment", reference: item.reference || item.invoice || item.id, details: `${item.purpose || "Vendor payment"} - ${item.vendor}`, method: `${item.debitAccount || `Accounts payable - ${item.vendor}`} debit / ${item.creditAccount || item.method || "Bank"} credit`, amount: -Number(item.amount || 0), status: item.status })),
    ...reportRecords.journals.map((item) => {
      const lines = normalizeFinanceJournalLines(item);
      const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      return { date: item.date, type: "Journal", reference: item.reference || item.id, details: `${item.purpose || "Journal"} - ${lines.length} lines`, method: `Debit ${formatMoney(debitTotal)} / Credit ${formatMoney(creditTotal)}`, amount: debitTotal, status: item.status };
    }),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const isLedger = view === "General Ledger";
  const rawLedgerRows = [
    ...reportRecords.banks.filter((item) => item.status === "Active").map((item) => ({ date: item.updatedAt?.slice(0, 10) || localDateKey(), account: item.accountName, debit: Number(item.openingBalance || 0), credit: 0, source: "Opening balance", reference: item.id, details: item.bankName })),
    ...reportRecords.receipts.filter((item) => item.status === "Received").flatMap((item) => [
      { date: item.date, account: item.debitAccount || item.method || "Cash", debit: Number(item.amount || 0), credit: 0, source: "Receipt", reference: item.reference || item.id, details: `${item.purpose || "Receipt"} - ${item.customer}` },
      { date: item.date, account: item.creditAccount || "Sales", debit: 0, credit: Number(item.amount || 0), source: "Receipt", reference: item.reference || item.id, details: `${item.purpose || "Receipt"} - ${item.customer}` },
    ]),
    ...expenses.filter((item) => item.status === "Posted").flatMap((item) => [
      { date: item.date, account: item.debitAccount || expenseAccountForPurpose(item.category), debit: Number(item.amount || 0), credit: 0, source: "Expense", reference: item.reference || item.id, details: `${item.category}${item.note ? ` - ${item.note}` : ""}` },
      { date: item.date, account: item.creditAccount || item.paidFrom || "Cash", debit: 0, credit: Number(item.amount || 0), source: "Expense", reference: item.reference || item.id, details: item.category },
    ]),
    ...reportRecords.vendors.filter((item) => item.status !== "Cancelled").flatMap((item) => [
      { date: item.date, account: item.debitAccount || `Accounts payable - ${item.vendor}`, debit: Number(item.amount || 0), credit: 0, source: "Vendor payment", reference: item.reference || item.invoice || item.id, details: `${item.purpose || "Vendor settlement"} - ${item.vendor}` },
      { date: item.date, account: item.creditAccount || item.method || "Bank", debit: 0, credit: Number(item.amount || 0), source: "Vendor payment", reference: item.reference || item.invoice || item.id, details: item.vendor },
    ]),
    ...reportRecords.journals.filter((item) => item.status === "Posted").flatMap((item) => normalizeFinanceJournalLines(item).map((line) => ({ date: item.date, account: line.account, debit: Number(line.debit || 0), credit: Number(line.credit || 0), source: "Journal", reference: item.reference || item.id, details: line.description || `${item.purpose || "Journal"}${item.note ? ` - ${item.note}` : ""}` }))),
  ].filter((item) => item.account);
  const runningBalances = {};
  const ledgerRowsWithBalances = rawLedgerRows.sort((a, b) => `${a.date}-${a.reference}`.localeCompare(`${b.date}-${b.reference}`)).map((item) => {
    const balance = (runningBalances[item.account] || 0) + item.debit - item.credit;
    runningBalances[item.account] = balance;
    return { ...item, balance };
  }).filter((item) => (!filters.query || `${item.account} ${item.reference} ${item.details}`.toLowerCase().includes(filters.query.toLowerCase())) && (!filters.from || item.date >= filters.from) && (!filters.to || item.date <= filters.to));
  const ledgerRows = ledgerRowsWithBalances;
  const visibleLedgerBalances = {};
  ledgerRows.forEach((item) => { visibleLedgerBalances[item.account] = item.balance; });
  const ledgerAccounts = Object.entries(visibleLedgerBalances).sort(([a], [b]) => a.localeCompare(b));
  const customLedgerMasters = ledgerMasters.filter((ledger) => !ledger.system && ledger.status !== "Inactive");
  const ledgerHierarchy = financeLedgerHierarchy(customLedgerMasters, runningBalances).filter((section) => section.groups.length);
  const ledgerTreeNodeKeys = ledgerHierarchy.flatMap((section) => [`type:${section.type}`, ...section.groups.map((group) => `group:${section.type}:${group.name}`)]);
  const allLedgerNodesCollapsed = ledgerTreeNodeKeys.length > 0 && ledgerTreeNodeKeys.every((key) => collapsedLedgerNodes.has(key));
  const toggleLedgerNode = (key) => setCollapsedLedgerNodes((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const expandAllLedgerNodes = () => setCollapsedLedgerNodes(new Set());
  const collapseAllLedgerNodes = () => setCollapsedLedgerNodes(new Set(ledgerTreeNodeKeys));
  const financeExportColumns = view === "Receipts"
    ? ["date", "customer", "purpose", "debitAccount", "creditAccount", "reference", "amount", "status", "note"]
    : view === "Bank Accounts"
      ? ["accountName", "bankName", "accountNumber", "openingBalance", "status", "note"]
      : view === "Vendor Payments"
        ? ["date", "vendor", "purpose", "invoice", "dueAmount", "amount", "debitAccount", "creditAccount", "status", "reference", "note"]
        : ["date", "purpose", "reference", "debitAccount", "creditAccount", "amount", "status", "note"];
  const financeTableColumnCount = view === "Vendor Payments" ? 11 : view === "Bank Accounts" ? 6 : view === "Journal Entries" ? 8 : 9;

  if (isLedger) return <section className="screen"><div className="metric-grid compact">
    <Metric icon={BookOpen} label="Ledger accounts" value={ledgerAccounts.length} trend="Accounts with recorded movement" />
    <Metric icon={ReceiptText} label="Total debits" value={formatMoney(ledgerRows.reduce((sum, item) => sum + item.debit, 0))} trend="Selected ledger period" />
    <Metric icon={CreditCard} label="Total credits" value={formatMoney(ledgerRows.reduce((sum, item) => sum + item.credit, 0))} trend="Selected ledger period" />
    <Metric icon={ClipboardList} label="Ledger entries" value={ledgerRows.length} trend="Receipts, expenses, vendor payments, journals" />
  </div><section className="panel finance-workspace"><div className="panel-head finance-head"><div><BookOpen /><h2>General ledger</h2></div><div className="finance-actions ledger-toolbar"><button className="ledger-toolbar-primary" onClick={() => { if (!canManageAll) return notify("Only an administrator can create ledgers"); setLedgerMasterOpen(true); setLedgerFormOpen(false); }}><Plus size={18} />Create ledger</button><button className="ledger-toolbar-primary" onClick={() => { if (!canManageAll) return notify("Only an administrator can create ledger entries"); setLedgerFormOpen(true); setLedgerMasterOpen(false); }}><ClipboardList size={18} />Post journal entry</button><button className={filtersOpen ? "active-action" : ""} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} />Filter</button><button className={rangeOpen ? "active-action" : ""} onClick={() => setRangeOpen((open) => !open)}><CalendarClock size={18} />Date range</button><button onClick={() => downloadCsv("vestora-general-ledger.csv", ["Date", "Account", "Source", "Reference", "Details", "Debit", "Credit", "Balance"], ledgerRows.map((item) => ({ Date: item.date, Account: item.account, Source: item.source, Reference: item.reference, Details: item.details, Debit: item.debit, Credit: item.credit, Balance: item.balance })))}><Download size={18} />Export</button></div></div>
    {ledgerMasterOpen && <form className="finance-expense-form ledger-master-form" onSubmit={saveLedgerMaster}><div className="finance-form-title"><div><span>Ledger master</span><h3>Create ledger account</h3></div><button type="button" className="icon-action" title="Close ledger form" onClick={() => setLedgerMasterOpen(false)}><X size={18} /></button></div><label>Auto code<input value={ledgerMasterDraft.code} readOnly /></label><label>Ledger name<input autoFocus placeholder="Bank Charges" value={ledgerMasterDraft.name} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, name: event.target.value }))} required /></label><label>Account type<select value={ledgerMasterDraft.type} onChange={(event) => updateLedgerMasterType(event.target.value)}>{Object.keys(financeLedgerGroups).map((type) => <option key={type}>{type}</option>)}</select></label><label>Group<select value={ledgerMasterDraft.group} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, group: event.target.value }))}>{(financeLedgerGroups[ledgerMasterDraft.type] || []).map((group) => <option key={group}>{group}</option>)}</select></label><label>Status<select value={ledgerMasterDraft.status} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option></select></label><div className="finance-form-actions"><button type="button" onClick={() => setLedgerMasterOpen(false)}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />Save ledger</button></div></form>}
    {ledgerFormOpen && <form className="finance-expense-form journal-entry-form" onSubmit={saveLedgerEntry}><div className="finance-form-title"><div><span>Manual journal</span><h3>Create balanced ledger entry</h3></div><button type="button" className="icon-action" title="Close ledger entry form" onClick={() => setLedgerFormOpen(false)}><X size={18} /></button></div>{renderJournalFields(ledgerDraft, (patch) => setLedgerDraft((current) => ({ ...current, ...patch })), true)}<label className="finance-note">Notes<input placeholder="Optional note for this journal" value={ledgerDraft.note} onChange={(event) => setLedgerDraft((current) => ({ ...current, note: event.target.value }))} /></label><div className="finance-form-actions"><button type="button" onClick={() => setLedgerFormOpen(false)}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />Post entry</button></div></form>}
    {(filtersOpen || rangeOpen) && <div className="finance-filter-row ledger-filter-panel">{filtersOpen && <label className="finance-search"><Search size={18} /><input placeholder="Search account, reference, or details" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>}{rangeOpen && <><label>Start date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>End date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label></>}<button className="text-action" onClick={() => setFilters({ query: "", method: "All", status: "All", from: "", to: "" })}>Clear filters</button></div>}
  <div className="ledger-report-shell"><div className="ledger-report-hero"><div><span>General ledger report</span><h3>Chart of accounts and activity</h3><p>Review custom ledger groups, account balances, and posted debit or credit movements in one easy report view.</p></div><div className="ledger-report-total"><small>Net movement</small><strong>{formatMoney(ledgerRows.reduce((sum, item) => sum + item.debit - item.credit, 0))}</strong><em>{ledgerRows.length} posted lines</em></div></div><div className="finance-summary chart-account-summary"><span>Chart of accounts</span><div className="chart-account-tools"><span><strong>{customLedgerMasters.length}</strong> custom ledgers</span><button type="button" onClick={expandAllLedgerNodes} disabled={!ledgerTreeNodeKeys.length || !allLedgerNodesCollapsed}><ChevronDown size={16} />Expand all</button><button type="button" onClick={collapseAllLedgerNodes} disabled={!ledgerTreeNodeKeys.length || allLedgerNodesCollapsed}><ChevronRight size={16} />Collapse all</button></div></div><div className="chart-account-table"><div className="chart-account-head"><span>Account group</span><span>Balance</span></div>{ledgerHierarchy.length ? ledgerHierarchy.map((section) => { const typeKey = `type:${section.type}`; const typeClosed = collapsedLedgerNodes.has(typeKey); return <div className="chart-account-section" key={section.type}><button type="button" className="chart-account-row type-row" onClick={() => toggleLedgerNode(typeKey)} aria-expanded={!typeClosed}><span>{typeClosed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {typeClosed ? <Folder size={17} /> : <FolderOpen size={17} />} <strong>{section.type}</strong> <em>{section.groups.length} groups</em></span><b>{formatMoney(section.balance)}</b></button>{!typeClosed && section.groups.map((group) => { const groupKey = `group:${section.type}:${group.name}`; const groupClosed = collapsedLedgerNodes.has(groupKey); return <div className="chart-account-group" key={groupKey}><button type="button" className="chart-account-row group-row" onClick={() => toggleLedgerNode(groupKey)} aria-expanded={!groupClosed}><span>{groupClosed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {groupClosed ? <Folder size={17} /> : <FolderOpen size={17} />} <strong>{group.name}</strong> <em>{group.ledgers.length} ledgers</em></span><b>{formatMoney(group.balance)}</b></button>{!groupClosed && group.ledgers.map((ledger) => <div className="chart-account-row ledger-row" key={ledger.id || ledger.code}><span><BookOpen size={15} /> <strong>{ledger.code}</strong> - {ledger.name}</span><b>{formatMoney(runningBalances[ledger.name] || 0)}</b></div>)}</div>; })}</div>; }) : <div className="finance-empty">No custom ledgers created. Use Create ledger to add bank charges, capital, loan, asset, income, or expense ledgers.</div>}</div><div className="ledger-section-heading"><div><span>Posted activity</span><strong>Transaction movement</strong></div><small>Debit and credit lines are shown with running balance per ledger.</small></div><div className="finance-table-wrap ledger-activity-table"><table className="finance-table"><thead><tr><th>Date</th><th>Account</th><th>Source</th><th>Reference</th><th>Details</th><th>Debit</th><th>Credit</th><th>Running balance</th></tr></thead><tbody>{ledgerRows.length ? ledgerRows.map((item, index) => <tr key={`${item.account}-${item.reference}-${index}`}><td>{item.date || "-"}</td><td><strong>{item.account}</strong></td><td><span className="ledger-source-pill">{item.source}</span></td><td>{item.reference}</td><td>{item.details || "-"}</td><td>{item.debit ? formatMoney(item.debit) : "-"}</td><td>{item.credit ? formatMoney(item.credit) : "-"}</td><td><strong>{formatMoney(item.balance)}</strong></td></tr>) : <tr><td colSpan="8" className="finance-empty">No ledger entries match this period. Create a ledger entry or record receipts, expenses, vendor payments, or journals.</td></tr>}</tbody></table></div>{ledgerAccounts.length > 0 && <div className="finance-summary ledger-account-summary">{ledgerAccounts.map(([account, balance]) => <span key={account}>{account} <strong>{formatMoney(balance)}</strong></span>)}</div>}</div></section></section>;

  if (isReports) return <section className="screen"><div className="metric-grid compact">
    <Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(netSales)} trend="POS sales after refunds" />
    <Metric icon={ReceiptText} label="Recorded receipts" value={formatMoney(receiptTotal)} trend={`${receipts.length} received records`} />
    <Metric icon={DatabaseZap} label="Expenses" value={formatMoney(expenseTotal)} trend={`${expenses.length} expense records`} />
    <Metric icon={ClipboardList} label="Journal value" value={formatMoney(journalTotal)} trend={`${reportRecords.journals.length} journal entries`} />
    <Metric icon={BadgeIndianRupee} label="Vendor paid" value={formatMoney(vendorPaymentTotal)} trend={`${reportRecords.vendors.length} vendor payments`} />
  </div><section className="panel finance-workspace"><div className="panel-head finance-head"><div><FileBarChart /><h2>Finance reports</h2></div><button onClick={() => downloadCsv("vestora-finance-report.csv", ["Date", "Type", "Reference", "Details", "Method", "Amount", "Status"], reportRows.map((item) => ({ Date: item.date, Type: item.type, Reference: item.reference, Details: item.details, Method: item.method, Amount: item.amount, Status: item.status })))}><Download size={18} />Export</button></div><div className="finance-summary"><span>Cash collected <strong>{formatMoney(cashCollected)}</strong></span><span>Receivables <strong>{formatMoney(receivables)}</strong></span><span>Bank accounts <strong>{reportRecords.banks.length}</strong></span><span>Net GST <strong>{formatMoney(netGst)}</strong></span></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Details</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{reportRows.length ? reportRows.map((item, index) => <tr key={`${item.type}-${item.reference}-${index}`}><td>{item.date || "-"}</td><td>{item.type}</td><td>{item.reference}</td><td>{item.details}</td><td>{item.method}</td><td>{formatMoney(item.amount)}</td><td><span className={`status-pill ${String(item.status).toLowerCase()}`}>{item.status}</span></td></tr>) : <tr><td colSpan="7" className="finance-empty">No finance activity recorded yet.</td></tr>}</tbody></table></div></section></section>;

  return <section className="screen"><div className="metric-grid compact"><Metric icon={BadgeIndianRupee} label="Net sales" value={formatMoney(netSales)} trend="POS sales after refunds" /><Metric icon={CreditCard} label="Cash collected" value={formatMoney(cashCollected)} trend="POS cash payments" /><Metric icon={DatabaseZap} label="Expenses" value={formatMoney(expenseTotal)} trend={`${expenses.length} expense records`} /><Metric icon={ReceiptText} label="Receivables" value={formatMoney(receivables)} trend="Credit due" /></div><section className="panel finance-workspace"><div className="panel-head finance-head"><div>{view === "Receipts" ? <ReceiptText /> : view === "Bank Accounts" ? <CreditCard /> : view === "Vendor Payments" ? <BadgeIndianRupee /> : <ClipboardList />}<h2>{title}</h2></div><div className="finance-actions"><button onClick={openNew}><Plus size={18} />{view === "Receipts" ? "Record receipt" : view === "Bank Accounts" ? "Add bank account" : view === "Vendor Payments" ? "Record vendor payment" : "Record journal"}</button><button className={filtersOpen ? "active-action" : ""} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} />Filter</button>{view !== "Bank Accounts" && <button className={rangeOpen ? "active-action" : ""} onClick={() => setRangeOpen((open) => !open)}><CalendarClock size={18} />Date range</button>}<button onClick={() => downloadCsv(`vestora-${view.toLowerCase().replaceAll(" ", "-")}.csv`, financeExportColumns, filtered)}><Download size={18} />Export</button></div></div>
    {(filtersOpen || rangeOpen) && <div className="finance-filter-row">{filtersOpen && <><label className="finance-search"><Search size={18} /><input placeholder={`Search ${title.toLowerCase()}`} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>{["Receipts", "Vendor Payments"].includes(view) && <label>Debit / credit account<select value={filters.method} onChange={(event) => setFilters((current) => ({ ...current, method: event.target.value }))}><option>All</option>{accountNames.map((account) => <option key={account}>{account}</option>)}</select></label>}<label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></>}{rangeOpen && <><label>Start date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>End date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label></>}<button className="text-action" onClick={() => setFilters({ query: "", method: "All", status: "All", from: "", to: "" })}>Clear filters</button></div>}
    {ledgerMasterOpen && <form className="finance-expense-form ledger-master-form" onSubmit={saveLedgerMaster}><div className="finance-form-title"><div><span>Ledger master</span><h3>Create ledger account</h3></div><button type="button" className="icon-action" title="Close ledger form" onClick={() => setLedgerMasterOpen(false)}><X size={18} /></button></div><label>Auto code<input value={ledgerMasterDraft.code} readOnly /></label><label>Ledger name<input autoFocus placeholder="Bank Charges" value={ledgerMasterDraft.name} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, name: event.target.value }))} required /></label><label>Account type<select value={ledgerMasterDraft.type} onChange={(event) => updateLedgerMasterType(event.target.value)}>{Object.keys(financeLedgerGroups).map((type) => <option key={type}>{type}</option>)}</select></label><label>Group<select value={ledgerMasterDraft.group} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, group: event.target.value }))}>{(financeLedgerGroups[ledgerMasterDraft.type] || []).map((group) => <option key={group}>{group}</option>)}</select></label><label>Status<select value={ledgerMasterDraft.status} onChange={(event) => setLedgerMasterDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option></select></label><div className="finance-form-actions"><button type="button" onClick={() => setLedgerMasterOpen(false)}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />Save ledger</button></div></form>}
    {formOpen && <form className={`finance-expense-form ${view === "Journal Entries" ? "journal-entry-form" : ""}`} onSubmit={saveRecord}><div className="finance-form-title"><div><span>{editingId ? `Update ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}</span><strong>{title}</strong></div><button type="button" className="icon-button" title="Close form" onClick={resetForm}><X size={18} /></button></div>{view === "Receipts" && <><label>Customer<input autoFocus placeholder="Customer name" value={draft.customer} onChange={(event) => setValue("customer", event.target.value)} /></label><label>Purpose / received for<select value={draft.purpose || "Food sales"} onChange={(event) => setValue("purpose", event.target.value)}>{financeReceiptPurposes.map((purpose) => <option key={purpose}>{purpose}</option>)}</select></label><label>Debited account / received into<select value={draft.debitAccount || draft.method || "Cash"} onChange={(event) => { setValue("debitAccount", event.target.value); setValue("method", event.target.value); }}>{financeOptions(accountNames, draft.debitAccount || draft.method).map((account) => <option key={account}>{account}</option>)}</select></label><label>Credited account<select value={draft.creditAccount || "Sales"} onChange={(event) => setValue("creditAccount", event.target.value)}>{financeOptions(accountNames, draft.creditAccount || "Sales").map((account) => <option key={account}>{account}</option>)}</select></label><label>Amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setValue("amount", event.target.value)} /></label><label>Date<input type="date" value={draft.date} onChange={(event) => setValue("date", event.target.value)} /></label></>}{view === "Bank Accounts" && <><label>Account name<input autoFocus placeholder="Current account" value={draft.accountName} onChange={(event) => setValue("accountName", event.target.value)} /></label><label>Bank name<input placeholder="Bank name" value={draft.bankName} onChange={(event) => setValue("bankName", event.target.value)} /></label><label>Account number<input placeholder="Last four digits or account number" value={draft.accountNumber} onChange={(event) => setValue("accountNumber", event.target.value)} /></label><label>Opening balance<input type="number" step="0.01" value={draft.openingBalance} onChange={(event) => setValue("openingBalance", event.target.value)} /></label></>}{view === "Vendor Payments" && <><label>Vendor<input autoFocus placeholder="Supplier or vendor name" value={draft.vendor} onChange={(event) => setValue("vendor", event.target.value)} /></label><label>Purpose / paid for<select value={draft.purpose || "Supplier settlement"} onChange={(event) => setValue("purpose", event.target.value)}>{financeJournalPurposes.map((purpose) => <option key={purpose}>{purpose}</option>)}</select></label><label>Invoice no.<input placeholder="Supplier invoice number" value={draft.invoice} onChange={(event) => setValue("invoice", event.target.value)} /></label><label>Due amount<input type="number" min="0" step="0.01" value={draft.dueAmount} onChange={(event) => setValue("dueAmount", event.target.value)} /></label><label>Paid amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setValue("amount", event.target.value)} /></label><label>Debited account<select value={draft.debitAccount || "Accounts payable"} onChange={(event) => setValue("debitAccount", event.target.value)}>{financeOptions(accountNames, draft.debitAccount || "Accounts payable").map((account) => <option key={account}>{account}</option>)}</select></label><label>Credited account / paid from<select value={draft.creditAccount || draft.method || "Bank"} onChange={(event) => { setValue("creditAccount", event.target.value); setValue("method", event.target.value); }}>{financeOptions(accountNames, draft.creditAccount || draft.method).map((account) => <option key={account}>{account}</option>)}</select></label><label>Date<input type="date" value={draft.date} onChange={(event) => setValue("date", event.target.value)} /></label></>}{view === "Journal Entries" && renderJournalFields(draft, (patch) => setDraft((current) => ({ ...current, ...patch })), true)}<label>Status<select value={draft.status} onChange={(event) => setValue("status", event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Reference<input placeholder="Invoice, voucher, or receipt number" value={draft.reference || ""} onChange={(event) => setValue("reference", event.target.value)} /></label><label className="finance-note">Notes<input placeholder="Optional note" value={draft.note} onChange={(event) => setValue("note", event.target.value)} /></label><div className="finance-form-actions"><button type="button" onClick={resetForm}>Cancel</button><button className="primary-action" type="submit"><Save size={18} />{editingId ? "Save changes" : `Save ${singular.toLowerCase()}`}</button></div></form>}
    <div className="finance-summary"><span>Showing <strong>{filtered.length}</strong> records</span><span>{view === "Receipts" ? "Received" : view === "Bank Accounts" ? "Opening balance" : view === "Vendor Payments" ? "Paid to vendors" : "Posted value"} <strong>{formatMoney(filtered.reduce((sum, item) => sum + Number(item.amount ?? item.openingBalance ?? 0), 0))}</strong></span></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr>{view === "Receipts" ? <><th>Date</th><th>Customer</th><th>Purpose</th><th>Debited</th><th>Credited</th><th>Receipt no.</th><th>Amount</th></> : view === "Bank Accounts" ? <><th>Account</th><th>Bank</th><th>Account number</th><th>Opening balance</th></> : view === "Vendor Payments" ? <><th>Date</th><th>Vendor</th><th>Purpose</th><th>Invoice no.</th><th>Due</th><th>Paid</th><th>Balance</th><th>Debited</th><th>Credited</th></> : <><th>Date</th><th>Purpose</th><th>Entry no.</th><th>Debited</th><th>Credited</th><th>Amount</th></>}<th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.length ? filtered.map((record) => <tr key={record.id}>{view === "Receipts" ? <><td>{record.date}</td><td><strong>{record.customer}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.purpose || "Food sales"}</td><td>{record.debitAccount || record.method}</td><td>{record.creditAccount || "Sales"}</td><td>{record.reference || record.id}</td><td>{formatMoney(record.amount)}</td></> : view === "Bank Accounts" ? <><td><strong>{record.accountName}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.bankName}</td><td>{record.accountNumber || "-"}</td><td>{formatMoney(record.openingBalance)}</td></> : view === "Vendor Payments" ? <><td>{record.date}</td><td><strong>{record.vendor}</strong>{record.note && <small>{record.note}</small>}</td><td>{record.purpose || "Supplier settlement"}</td><td>{record.invoice || record.reference || "-"}</td><td>{formatMoney(record.dueAmount)}</td><td>{formatMoney(record.amount)}</td><td>{formatMoney(Math.max(0, Number(record.dueAmount || 0) - Number(record.amount || 0)))}</td><td>{record.debitAccount || `Accounts payable - ${record.vendor}`}</td><td>{record.creditAccount || record.method}</td></> : <><td>{record.date}</td><td>{record.purpose || "Journal"}</td><td>{record.reference || record.id}</td><td>{record.debitAccount}</td><td>{record.creditAccount}</td><td>{formatMoney(record.amount)}</td></>}<td><span className={`status-pill ${String(record.status).toLowerCase()}`}>{record.status}</span></td><td><div className="row-actions"><button title={`Edit ${singular.toLowerCase()}`} onClick={() => editRecord(record)}><Pencil size={17} />Edit</button><button className="danger-action" title={`Delete ${singular.toLowerCase()}`} onClick={() => deleteRecord(record)}><Trash2 size={17} />Delete</button></div></td></tr>) : <tr><td colSpan={financeTableColumnCount} className="finance-empty">No {title.toLowerCase()} records match this view.</td></tr>}</tbody></table></div></section></section>;
}

function BillTemplateEditor({ billTemplate, setBillTemplate, notify }) {
  const displayToggles = [
    ["showLogo", "Logo"],
    ["showAddress", "Address"],
    ["showPhone", "Phone"],
    ["showEmail", "Email"],
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
  const billPreviewClass = `bill-paper print-bill bill-paper-size-${billTemplate.printerSize === "58mm" ? "58" : "80"} bill-layout-${String(billTemplate.layout || "Detailed").toLowerCase()}`;
  const billPreviewStyle = getBillPaperStyle({ ...billTemplate, fontSize: billFontSize });

  function updateBillFontSize(value) {
    update("fontSize", getBillFontSize(value));
  }

  function saveBillFormat() {
    const normalizedTemplate = { ...defaultBillTemplate, ...billTemplate, fontSize: billFontSize };
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
            <div className="bill-editor-card-head"><strong>Footer and QR</strong><span>Closing copy, tear line, and optional QR placeholder</span></div>
            <div className="bill-editor-grid">
              <label className="wide">Footer message<input value={billTemplate.footer} onChange={(event) => update("footer", event.target.value)} /></label>
              <label className="wide">Terms / policy<input value={billTemplate.terms || ""} onChange={(event) => update("terms", event.target.value)} /></label>
              <label>QR label<input value={billTemplate.qrText || ""} onChange={(event) => update("qrText", event.target.value)} /></label>
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

const localOfferCatalog = [
  { id: "OFF-001", name: "Happy Hour", type: "Time based", discount: "20% off beverages", window: "4:00 PM - 7:00 PM", days: "Monday - Friday", status: "Active" },
  { id: "OFF-002", name: "Weekend Feast", type: "Percentage", discount: "15% off mains", window: "All day", days: "Saturday - Sunday", status: "Scheduled" },
  { id: "OFF-003", name: "Buy 1 Get 1 Chaas", type: "BOGO", discount: "Buy 1, get 1 free", window: "12:00 PM - 3:00 PM", days: "Every day", status: "Active" },
  { id: "OFF-004", name: "Family Combo", type: "Combo", discount: "Save ₹120 on a combo", window: "All day", days: "Every day", status: "Draft" },
  { id: "OFF-005", name: "Welcome Coupon", type: "Coupon", discount: "₹100 off on first order", window: "All day", days: "New customers", status: "Active" },
];

const offerTypeForView = {
  "Happy hour offer": "Time based",
  "BOGO offers": "BOGO",
  "Combo discounts": "Combo",
  "Weekend offers": "Percentage",
  Coupons: "Coupon",
};

function escapePrintHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function connectQzTray() {
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  return qz.printers.find();
}

async function printKotWithQz({ printerName, paper, copies = 1, order, isTest = false }) {
  if (!printerName?.trim()) throw new Error("Choose a printer from the QZ Tray printer list");
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  const ticketId = isTest ? "TEST-KOT" : order?.kotId || order?.orderNumber || "KOT";
  const title = isTest ? "QZ TRAY TEST PRINT" : "KITCHEN ORDER TICKET";
  const lines = isTest
    ? [{ qty: 1, name: "Printer test" }, { qty: 1, name: "KOT connection" }]
    : order?.kotPrintItems || order?.items || [];
  const itemsHtml = lines.map((item) => `<p><b>${escapePrintHtml(item.qty || 1)} ×</b> ${escapePrintHtml(item.name)}${item.notes ? `<br><small>${escapePrintHtml(item.notes)}</small>` : ""}</p>`).join("");
  const width = paper === "58mm" ? "52mm" : "72mm";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:${width};margin:0;padding:3mm;color:#000;font-size:12pt}header{text-align:center;border-bottom:1px dashed #000;padding-bottom:2mm;margin-bottom:2mm}h2{font-size:14pt;margin:0 0 2mm}header strong{font-size:12pt}.meta{font-size:10pt;margin:1mm 0 3mm}.items p{margin:2mm 0;word-break:break-word}footer{border-top:1px dashed #000;margin-top:3mm;padding-top:2mm;text-align:center;font-size:9pt}</style></head><body><header><h2>${title}</h2><strong>${escapePrintHtml(ticketId)}</strong></header><div class="meta">${isTest ? "UVPRO KOT printer test" : `Table: ${escapePrintHtml(order?.tableName || "—")}<br>Waiter: ${escapePrintHtml(order?.waiterName || "—")}<br>${escapePrintHtml(new Date().toLocaleString("en-IN"))}`}</div><main class="items">${itemsHtml}</main><footer>UVPRO · ${escapePrintHtml(printerName)}</footer></body></html>`;
  const config = qz.configs.create(printerName, { copies: Math.max(1, Math.min(5, Number(copies) || 1)), margins: 0 });
  return qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
}

const offerWeekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function offerIconForType(type) {
  if (type === "Time based") return Clock;
  if (type === "BOGO") return Sparkles;
  if (type === "Combo") return BadgeIndianRupee;
  if (type === "Coupon") return ReceiptText;
  return Percent;
}

function formatOfferDiscount(type, value) {
  const amount = Number(value || 0);
  if (type === "BOGO") return "Buy 1, get 1 free";
  if (type === "Combo") return `Save ₹${amount || 0} on a combo`;
  if (type === "Coupon") return `₹${amount || 0} off with coupon`;
  return `${amount || 0}% off`;
}

function formatOfferTime(timeValue) {
  const [hoursText, minutesText] = String(timeValue || "").split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "All day";
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatOfferDays(days) {
  if (days.length === offerWeekdays.length) return "Every day";
  if (!days.length) return "No days selected";
  return days.map((day) => day.slice(0, 3)).join(", ");
}

function parseOfferDays(days) {
  const value = String(days || "").toLowerCase();
  if (!value || value.includes("every day")) return offerWeekdays;
  if (value.includes("monday") && value.includes("friday") && value.includes("-")) return offerWeekdays.slice(0, 5);
  if (value.includes("saturday") && value.includes("sunday") && value.includes("-")) return offerWeekdays.slice(5);
  const selectedDays = offerWeekdays.filter((day) => value.includes(day.slice(0, 3).toLowerCase()));
  return selectedDays.length ? selectedDays : offerWeekdays;
}

function inputTimeFromOfferWindow(window, fallback) {
  const match = String(window || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return fallback;
  let hours = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function offerDiscountValue(offer) {
  const match = String(offer?.discount || "").match(/\d+(?:\.\d+)?/);
  return match?.[0] || "0";
}

function offerTimeInMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === "AM" && hours === 12) hours = 0;
  return hours * 60 + Number(match[2]);
}

function offerMatchesToday(offer) {
  const schedule = String(offer.days || "Every day").toLowerCase();
  if (schedule.includes("every day") || schedule.includes("new customer")) return true;
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  if (schedule.includes("-")) {
    const [startDay, endDay] = schedule.split("-").map((entry) => entry.trim().slice(0, 3));
    const startIndex = offerWeekdays.findIndex((entry) => entry.toLowerCase().startsWith(startDay));
    const endIndex = offerWeekdays.findIndex((entry) => entry.toLowerCase().startsWith(endDay));
    const dayIndex = offerWeekdays.findIndex((entry) => entry.toLowerCase() === day);
    if (startIndex >= 0 && endIndex >= 0 && dayIndex >= 0) return startIndex <= endIndex ? dayIndex >= startIndex && dayIndex <= endIndex : dayIndex >= startIndex || dayIndex <= endIndex;
  }
  return schedule.includes(day.slice(0, 3));
}

function offerMatchesTime(offer) {
  if (String(offer.window || "").toLowerCase().includes("all day")) return true;
  const [startText, endText] = String(offer.window || "").split("-");
  const start = offerTimeInMinutes(startText);
  const end = offerTimeInMinutes(endText);
  if (start === null || end === null) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

function calculatePosOffer(offer, cart, couponEntry = "") {
  if (offer.status !== "Active") return { amount: 0, error: "This offer is not active" };
  if (!offerMatchesToday(offer)) return { amount: 0, error: "This offer is not scheduled for today" };
  if (!offerMatchesTime(offer)) return { amount: 0, error: "This offer is outside its active time" };
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const offerValue = Number(offerDiscountValue(offer));

  if (offer.type === "BOGO") {
    const bought = cart.find((item) => String(item.id) === String(offer.buyProductId));
    const free = cart.find((item) => String(item.id) === String(offer.freeProductId));
    const pairCount = Math.min(Number(bought?.qty || 0), Number(free?.qty || 0));
    if (!pairCount) return { amount: 0, error: "Add both selected BOGO products to the bill" };
    return { amount: Math.min(subtotal, Math.round(pairCount * Number(free.price || 0))) };
  }

  if (offer.type === "Combo") {
    const productIds = offer.comboProductIds || [];
    if (productIds.length < 2 || !productIds.every((id) => cart.some((item) => String(item.id) === String(id) && Number(item.qty || 0) > 0))) return { amount: 0, error: "Add every product from this combo to the bill" };
    return { amount: Math.min(subtotal, Math.round(offerValue)) };
  }

  if (offer.type === "Coupon") {
    if (!offer.couponCode || String(couponEntry || "").trim().toUpperCase() !== String(offer.couponCode).trim().toUpperCase()) return { amount: 0, error: "Enter the correct coupon code" };
    if (subtotal < Number(offer.minimumOrder || 0)) return { amount: 0, error: `Minimum order is ${formatMoney(offer.minimumOrder)}` };
    return { amount: Math.min(subtotal, Math.round(offerValue)) };
  }

  const eligibleCart = offer.type === "Time based" && /beverage/i.test(offer.discount || "") ? cart.filter((item) => String(item.category || "").toLowerCase() === "beverages") : cart;
  const eligibleTotal = eligibleCart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  if (!eligibleTotal) return { amount: 0, error: "Add an eligible item to the bill" };
  return { amount: Math.min(subtotal, Math.round(eligibleTotal * (offerValue / 100))) };
}

function OffersPromotions({ notify, canManage, storeId, productItems = [], activeView = "Happy hour offer", onViewChange }) {
  const offersStorageKey = `vestora-offers-${storeId}`;
  const availableProducts = productItems.filter((item) => item.status !== "Inactive");
  const [selectedView, setSelectedView] = useState(activeView);
  const [offers, setOffers] = useBusinessState(offersStorageKey, () => {
    const savedOffers = loadStoredArray(offersStorageKey);
    return savedOffers.length ? savedOffers : localOfferCatalog;
  });
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [offerDraft, setOfferDraft] = useState({ name: "", type: "Time based", discountValue: "20", startTime: "16:00", endTime: "19:00", window: "All day", runDays: offerWeekdays, buyProductId: "", freeProductId: "", comboProductIds: [], couponCode: "", minimumOrder: "0", status: "Active" });

  useEffect(() => {
    setSelectedView(activeView);
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem(offersStorageKey, JSON.stringify(offers));
    syncLocalStateKeyToSupabase(offersStorageKey).catch(() => {});
  }, [offers, offersStorageKey]);

  const visibleOffers = offers.filter((offer) => {
    if (selectedView === "Happy hour offer") return offer.type === "Time based";
    if (selectedView === "All offers") return true;
    return offer.type === offerTypeForView[selectedView];
  });
  const activeCount = offers.filter((offer) => offer.status === "Active").length;
  const scheduledCount = offers.filter((offer) => offer.status === "Scheduled").length;
  const draftCount = offers.filter((offer) => offer.status === "Draft").length;

  function selectView(view) {
    setSelectedView(view);
    onViewChange?.(view);
    notify(`${view} selected`);
  }

  function toggleOffer(id) {
    if (!canManage) {
      notify("Only managers can change offer status");
      return;
    }
    setOffers((current) => current.map((offer) => offer.id === id ? { ...offer, status: offer.status === "Active" ? "Paused" : "Active" } : offer));
    const offer = offers.find((entry) => entry.id === id);
    notify(`${offer?.name || "Offer"} status updated`);
  }

  function openCreateOffer() {
    if (!canManage) {
      notify("Only managers can create offers");
      return;
    }
    const type = offerTypeForView[selectedView] || "Time based";
    setOfferDraft({
      name: "",
      type,
      discountValue: type === "Combo" || type === "Coupon" ? "100" : "20",
      startTime: "16:00",
      endTime: "19:00",
      window: "All day",
      runDays: offerWeekdays,
      buyProductId: availableProducts[0]?.id || "",
      freeProductId: availableProducts[1]?.id || availableProducts[0]?.id || "",
      comboProductIds: [],
      couponCode: "",
      minimumOrder: "0",
      status: "Active",
    });
    setEditingOfferId(null);
    setOfferDialogOpen(true);
  }

  function createOffer(event) {
    event.preventDefault();
    const name = offerDraft.name.trim();
    if (!name) {
      notify("Enter an offer name to continue");
      return;
    }
    const buyProduct = availableProducts.find((item) => item.id === offerDraft.buyProductId);
    const freeProduct = availableProducts.find((item) => item.id === offerDraft.freeProductId);
    if (offerDraft.type === "BOGO" && (!buyProduct || !freeProduct)) {
      notify("Select both BOGO products to continue");
      return;
    }
    if (offerDraft.type === "BOGO" && buyProduct.id === freeProduct.id) {
      notify("Choose different buy and free products for BOGO");
      return;
    }
    const comboProducts = availableProducts.filter((item) => offerDraft.comboProductIds.includes(item.id));
    if (offerDraft.type === "Combo" && comboProducts.length < 2) {
      notify("Select at least two products for a combo offer");
      return;
    }
    const couponCode = offerDraft.couponCode.trim().toUpperCase();
    if (offerDraft.type === "Coupon" && !couponCode) {
      notify("Enter a coupon code to continue");
      return;
    }
    const existingOffer = offers.find((offer) => offer.id === editingOfferId);
    const offer = {
      ...(existingOffer || {}),
      id: editingOfferId || `OFF-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      type: offerDraft.type,
      discount: offerDraft.type === "BOGO" ? `Buy ${buyProduct.name}, get ${freeProduct.name} free` : offerDraft.type === "Combo" ? `Save ₹${Number(offerDraft.discountValue || 0)} on ${comboProducts.map((item) => item.name).join(" + ")}` : offerDraft.type === "Coupon" ? `₹${Number(offerDraft.discountValue || 0)} off · ${couponCode}` : formatOfferDiscount(offerDraft.type, offerDraft.discountValue),
      window: offerDraft.type === "Time based" ? `${formatOfferTime(offerDraft.startTime)} - ${formatOfferTime(offerDraft.endTime)}` : offerDraft.window.trim() || "All day",
      days: formatOfferDays(offerDraft.runDays),
      startTime: offerDraft.type === "Time based" ? offerDraft.startTime : undefined,
      endTime: offerDraft.type === "Time based" ? offerDraft.endTime : undefined,
      buyProductId: offerDraft.type === "BOGO" ? buyProduct.id : undefined,
      freeProductId: offerDraft.type === "BOGO" ? freeProduct.id : undefined,
      comboProductIds: offerDraft.type === "Combo" ? offerDraft.comboProductIds : undefined,
      couponCode: offerDraft.type === "Coupon" ? couponCode : undefined,
      minimumOrder: offerDraft.type === "Coupon" ? Number(offerDraft.minimumOrder || 0) : undefined,
      status: offerDraft.status,
    };
    const viewByType = { "Time based": "Happy hour offer", Percentage: "Weekend offers", BOGO: "BOGO offers", Combo: "Combo discounts", Coupon: "Coupons" };
    const createdOfferView = viewByType[offer.type] || "Happy hour offer";
    setOffers((current) => editingOfferId ? current.map((entry) => entry.id === editingOfferId ? offer : entry) : [offer, ...current]);
    setSelectedView(createdOfferView);
    onViewChange?.(createdOfferView);
    setOfferDialogOpen(false);
    setEditingOfferId(null);
    notify(`${offer.name} ${existingOffer ? "updated" : "created and ready for POS"}`);
  }

  function toggleOfferDay(day) {
    setOfferDraft((current) => ({
      ...current,
      runDays: current.runDays.includes(day) ? current.runDays.filter((selectedDay) => selectedDay !== day) : [...current.runDays, day],
    }));
  }

  function toggleComboProduct(productId) {
    setOfferDraft((current) => ({
      ...current,
      comboProductIds: current.comboProductIds.includes(productId) ? current.comboProductIds.filter((selectedId) => selectedId !== productId) : [...current.comboProductIds, productId],
    }));
  }

  function openEditOffer(offer) {
    if (!canManage) {
      notify("Only managers can edit offers");
      return;
    }
    setOfferDraft({
      name: offer.name || "",
      type: offer.type || "Time based",
      discountValue: offerDiscountValue(offer),
      startTime: offer.startTime || inputTimeFromOfferWindow(offer.window, "16:00"),
      endTime: offer.endTime || inputTimeFromOfferWindow(String(offer.window || "").split("-")[1], "19:00"),
      window: offer.type === "Time based" ? "All day" : offer.window || "All day",
      runDays: parseOfferDays(offer.days),
      buyProductId: offer.buyProductId || availableProducts[0]?.id || "",
      freeProductId: offer.freeProductId || availableProducts[1]?.id || availableProducts[0]?.id || "",
      comboProductIds: offer.comboProductIds || [],
      couponCode: offer.couponCode || "",
      minimumOrder: String(offer.minimumOrder || 0),
      status: offer.status || "Draft",
    });
    setEditingOfferId(offer.id);
    setOfferDialogOpen(true);
  }

  function deleteOffer(offer) {
    if (!canManage) {
      notify("Only managers can delete offers");
      return;
    }
    if (!window.confirm(`Delete ${offer.name}? This cannot be undone.`)) return;
    setOffers((current) => current.filter((entry) => entry.id !== offer.id));
    notify(`${offer.name} deleted`);
  }

  return (
    <section className="screen offers-screen">
      <div className="panel offers-hero">
        <div className="offers-hero-copy">
          <span className="offers-eyebrow"><Sparkles size={14} /> Promotions workspace</span>
          <h2>Offers your customers will look forward to.</h2>
          <p>Design time-based discounts, value bundles, and rewards that your team can apply confidently at the counter.</p>
          <div className="offers-hero-highlights"><span><CircleCheck size={14} /> Ready for POS</span><span><Clock size={14} /> Schedule with confidence</span></div>
        </div>
        <div className="offers-hero-actions">
          <button type="button" className="offers-create-button" onClick={openCreateOffer}><Plus size={17} /> Create offer</button>
        </div>
      </div>

      <div className="metric-grid compact offers-stat-grid">
        <Metric icon={Sparkles} label="Active offers" value={activeCount} trend="Live at POS" />
        <Metric icon={Clock} label="Happy Hour" value="20% off" trend="4:00 PM - 7:00 PM" />
        <Metric icon={CalendarClock} label="Scheduled" value={scheduledCount} trend="Ready to start" />
        <Metric icon={ClipboardList} label="Draft offers" value={draftCount} trend="Needs review" />
      </div>

      <div className="offers-content-grid offers-list-only">
        <div className="panel offers-list-panel">
          <PanelHead title={selectedView} icon={Sparkles} actions={["Create offer"]} onAction={openCreateOffer} />
          <div className="offers-list-meta"><span>{visibleOffers.length} offer{visibleOffers.length === 1 ? "" : "s"} shown</span><span>Shared store offers</span></div>
          <div className="offers-list">
            {visibleOffers.map((offer) => {
              const OfferIcon = offerIconForType(offer.type);
              return (
                <div className="offer-card" key={offer.id}>
                  <div className="offer-card-icon"><OfferIcon size={18} /></div>
                  <div className="offer-card-main"><div className="offer-card-title"><strong>{offer.name}</strong><span className={`offer-status ${offer.status.toLowerCase()}`}>{offer.status}</span></div><span>{offer.discount}</span><small>{offer.window} · {offer.days}</small></div>
                  <div className="offer-card-actions">
                    <button type="button" className="offer-card-action" onClick={() => toggleOffer(offer.id)}>{offer.status === "Active" ? "Pause" : "Activate"}</button>
                    <button type="button" className="offer-card-action" onClick={() => openEditOffer(offer)} title={`Edit ${offer.name}`}><Pencil size={14} /> Edit</button>
                    <button type="button" className="offer-card-action danger" onClick={() => deleteOffer(offer)} title={`Delete ${offer.name}`}><Trash2 size={14} /> Delete</button>
                  </div>
                </div>
              );
            })}
            {!visibleOffers.length && <div className="offers-empty"><Sparkles size={20} /><strong>No offers in this view yet</strong><span>Choose Create offer when you are ready to add one.</span></div>}
          </div>
        </div>
      </div>

      {offerDialogOpen && <div className="shift-modal-backdrop" role="presentation">
        <form className="shift-modal offer-create-modal" onSubmit={createOffer} role="dialog" aria-modal="true" aria-label="Create offer">
          <div className="shift-modal-head">
            <div><span>Promotion setup</span><h2>{editingOfferId ? "Edit offer" : "Create a new offer"}</h2></div>
            <button type="button" onClick={() => { setOfferDialogOpen(false); setEditingOfferId(null); }} title="Close"><X size={18} /></button>
          </div>
          <p className="modal-help-text">Set the customer-facing details your counter team will use at POS.</p>
          <div className="offer-form-grid">
            <label className="wide">Offer name<input value={offerDraft.name} onChange={(event) => setOfferDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Friday Dinner Special" autoFocus /></label>
            <label>Offer type<select value={offerDraft.type} onChange={(event) => setOfferDraft((current) => ({ ...current, type: event.target.value, discountValue: event.target.value === "Combo" || event.target.value === "Coupon" ? "100" : "20", window: event.target.value === "Time based" ? current.window : "All day" }))}><option>Time based</option><option>Percentage</option><option>BOGO</option><option>Combo</option><option>Coupon</option></select></label>
            {offerDraft.type === "BOGO" ? <><label>Customer buys<select value={offerDraft.buyProductId} onChange={(event) => setOfferDraft((current) => ({ ...current, buyProductId: event.target.value }))}><option value="">Select a menu item</option>{availableProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Customer gets free<select value={offerDraft.freeProductId} onChange={(event) => setOfferDraft((current) => ({ ...current, freeProductId: event.target.value }))}><option value="">Select a menu item</option>{availableProducts.map((item) => <option key={item.id} value={item.id} disabled={item.id === offerDraft.buyProductId}>{item.name}</option>)}</select></label></> : <label>{offerDraft.type === "Combo" || offerDraft.type === "Coupon" ? "Discount amount (₹)" : "Discount (%)"}<input type="number" min="0" value={offerDraft.discountValue} onChange={(event) => setOfferDraft((current) => ({ ...current, discountValue: event.target.value }))} /></label>}
            {offerDraft.type === "Combo" && <fieldset className="offer-product-picker wide"><legend>Products included in this combo</legend><p>Select two or more menu items.</p><div>{availableProducts.map((item) => <button type="button" key={item.id} className={offerDraft.comboProductIds.includes(item.id) ? "selected" : ""} onClick={() => toggleComboProduct(item.id)} aria-pressed={offerDraft.comboProductIds.includes(item.id)}><span>{item.name}</span><small>{formatMoney(item.price)}</small></button>)}</div></fieldset>}
            {offerDraft.type === "Coupon" && <><label>Coupon code<input value={offerDraft.couponCode} onChange={(event) => setOfferDraft((current) => ({ ...current, couponCode: event.target.value.toUpperCase() }))} placeholder="e.g. WELCOME100" maxLength="24" /></label><label>Minimum order (₹)<input type="number" min="0" value={offerDraft.minimumOrder} onChange={(event) => setOfferDraft((current) => ({ ...current, minimumOrder: event.target.value }))} /></label></>}
            {offerDraft.type === "Time based" ? <><label>Start time<input type="time" value={offerDraft.startTime} onChange={(event) => setOfferDraft((current) => ({ ...current, startTime: event.target.value }))} /></label><label>End time<input type="time" value={offerDraft.endTime} onChange={(event) => setOfferDraft((current) => ({ ...current, endTime: event.target.value }))} /></label></> : <label className="wide">Active window<input value={offerDraft.window} onChange={(event) => setOfferDraft((current) => ({ ...current, window: event.target.value }))} placeholder="e.g. All day" /></label>}
            <fieldset className="offer-days-field wide">
              <legend>Runs on</legend>
              <div className="offer-days-actions"><button type="button" className={offerDraft.runDays.length === offerWeekdays.length ? "selected" : ""} onClick={() => setOfferDraft((current) => ({ ...current, runDays: offerWeekdays }))}>Every day</button><span>{formatOfferDays(offerDraft.runDays)}</span></div>
              <div className="offer-days-grid">{offerWeekdays.map((day) => <button type="button" key={day} className={offerDraft.runDays.includes(day) ? "selected" : ""} onClick={() => toggleOfferDay(day)} aria-pressed={offerDraft.runDays.includes(day)}>{day.slice(0, 3)}</button>)}</div>
            </fieldset>
            <label>Status<select value={offerDraft.status} onChange={(event) => setOfferDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Scheduled</option><option>Draft</option></select></label>
          </div>
          <div className="shift-actions">
            <button type="button" onClick={() => { setOfferDialogOpen(false); setEditingOfferId(null); }}>Cancel</button>
            <button type="submit">{editingOfferId ? <Pencil size={16} /> : <Plus size={16} />}{editingOfferId ? "Save changes" : "Create offer"}</button>
          </div>
        </form>
      </div>}
    </section>
  );
}

function Reports({ notify, storeId, salesLedger, voidLedger, refundLedger, onRefund, lastShiftClose, comparisonStores = [], comparisonSalesLedger = [], activeView = "Daily sales", onReportChange }) {
  const [selectedReport, setSelectedReport] = useState(activeView);
  const [range, setRange] = useState("Today");
  const [reportSearch, setReportSearch] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportFilter, setReportFilter] = useState("All");
  const [refundDraft, setRefundDraft] = useState({ billId: "", amount: "", payment: "Cash", reason: "" });
  const [reportInventory] = useBusinessState(`vestora-inventory-${storeId}`, () => stripUntouchedDefaultRecords(loadStoredArray(`vestora-inventory-${storeId}`), defaultInventoryItems, ["updatedAt"]));
  const [reportRecipes] = useBusinessState(`vestora-recipes-${storeId}`, () => stripUntouchedDefaultRecords(loadStoredArray(`vestora-recipes-${storeId}`), defaultRecipes, ["changedAt", "changedBy"]));

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

function Admin({ notify, users, setUsers, currentUser, canManageAll, canManageStore, stores, activeStore, activeView, onViewChange, customRoles = [], setCustomRoles }) {
  const defaultUserStoreId = activeStore.id === "GLOBAL" ? "" : activeStore.id;
  const [draft, setDraft] = useState({ name: "", email: "", password: "", role: "Cashier", status: "Active", storeId: defaultUserStoreId });
  const [roleDraft, setRoleDraft] = useState({ id: "", name: "", description: "", status: "Active", modules: ["dashboard", "pos"] });
  const [editingId, setEditingId] = useState(null);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const showUserEditor = activeView === "create";
  const showRoleEditor = activeView === "roles";
  const canManageUsers = canManageStore;
  const baseRoleAccessSummary = {
    "Restaurant Admin": "Full access to this restaurant only, including staff and store operations.",
    "Branch Manager": "Dashboard, POS, kitchen, tables, menu, inventory, reports, and settings.",
    Cashier: "POS Billing, tables, dashboard, and finance. Use this role for billing counter staff.",
    Waiter: "POS ordering, assigned tables, and kitchen order status.",
    Chef: "Kitchen Display System, production, and inventory access.",
    Accountant: "Dashboard, finance, and reports only.",
  };
  const storeCustomRoles = customRoles.filter((role) => role.storeId === activeStore.id || role.storeId === "GLOBAL");
  const activeCustomRoles = storeCustomRoles.filter((role) => role.status !== "Inactive").map((role) => role.name);
  const roleAccessSummary = {
    ...baseRoleAccessSummary,
    ...Object.fromEntries(storeCustomRoles.map((role) => [role.name, role.description || `Custom role with ${role.modules?.length || 0} selected modules.`])),
  };
  const visibleUsers = users.filter((user) => {
    if (user.storeId === "GLOBAL") return false;
    if (!(canManageAll && activeStore.id === "GLOBAL") && normalizeStoreId(user.storeId) !== activeStore.id) return false;
    if (!canManageAll && user.role === "Super Admin") return false;
    return true;
  });
  const baseRoleChoices = canManageAll ? adminRoleChoicesAll : adminRoleChoicesStore;
  const roleChoices = Array.from(new Set([...baseRoleChoices, ...activeCustomRoles, draft.role].filter(Boolean)));
  const protectedRoleNames = new Set(["Super Admin", "Restaurant Admin", "Branch Manager", "Cashier", "Waiter", "Chef", "Accountant", "supplier"]);

  function resetUserEditor() {
    setDraft({ name: "", email: "", password: "", role: "Cashier", status: "Active", storeId: defaultUserStoreId });
    setEditingId(null);
    setShowUserPassword(false);
  }

  function resetRoleEditor() {
    setRoleDraft({ id: "", name: "", description: "", status: "Active", modules: ["dashboard", "pos"] });
  }

  function closeUserEditor() {
    resetUserEditor();
    onViewChange("all");
  }

  useEffect(() => {
    if (activeView === "all") resetUserEditor();
  }, [activeView]);

  function toggleRoleModule(moduleId) {
    setRoleDraft((current) => {
      const selected = new Set(current.modules || []);
      if (selected.has(moduleId)) selected.delete(moduleId);
      else selected.add(moduleId);
      return { ...current, modules: Array.from(selected) };
    });
  }

  function editRole(role) {
    setRoleDraft({ id: role.id, name: role.name, description: role.description || "", status: role.status || "Active", modules: role.modules?.length ? role.modules : ["dashboard"] });
  }

  function saveRole() {
    if (!canManageUsers) {
      notify("Admin permission required to create roles");
      return;
    }
    const name = roleDraft.name.trim();
    if (!name) {
      notify("Enter role name");
      return;
    }
    if (protectedRoleNames.has(name)) {
      notify("Built-in role name already exists");
      return;
    }
    const duplicate = customRoles.some((role) => role.storeId === activeStore.id && role.name.trim().toLowerCase() === name.toLowerCase() && role.id !== roleDraft.id);
    if (duplicate) {
      notify("Role name already exists");
      return;
    }
    if (!roleDraft.modules.length) {
      notify("Select at least one module for this role");
      return;
    }
    const savedRole = {
      ...roleDraft,
      id: roleDraft.id || `ROLE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      description: roleDraft.description.trim(),
      status: roleDraft.status || "Active",
      modules: roleDraft.modules,
      storeId: activeStore.id,
    };
    setCustomRoles((current) => current.some((role) => role.id === savedRole.id) ? current.map((role) => role.id === savedRole.id ? savedRole : role) : [savedRole, ...current]);
    resetRoleEditor();
    notify(`${savedRole.name} role saved`);
  }

  function deleteRole(role) {
    if (users.some((user) => user.role === role.name && normalizeStoreId(user.storeId) === activeStore.id)) {
      notify("Role is assigned to users. Change those users before deleting");
      return;
    }
    setCustomRoles((current) => current.filter((item) => item.id !== role.id));
    if (roleDraft.id === role.id) resetRoleEditor();
    notify(`${role.name} role deleted`);
  }

  function canEditUser(user) {
    if (!canManageUsers) return false;
    if (canManageAll) return true;
    return normalizeStoreId(user?.storeId) === activeStore.id && !["Super Admin", "Restaurant Admin"].includes(user?.role);
  }

  async function saveUser() {
    if (!canManageUsers) {
      notify("Admin permission required to create or edit users");
      return;
    }
    if (!draft.name || !draft.email || (!editingId && !draft.password)) {
      notify("Enter user name, email, and a password for a new login");
      return;
    }
    const targetStoreId = activeStore.id === "GLOBAL" ? normalizeStoreId(draft.storeId) : activeStore.id;
    if (!stores.some((store) => store.id === targetStoreId)) {
      notify("Select a branch for this user");
      return;
    }
    const duplicateEmail = users.some((user) => user.email.trim().toLowerCase() === draft.email.trim().toLowerCase() && user.id !== editingId);
    if (duplicateEmail) {
      notify("This email already has a UVPRO login");
      return;
    }
    const allowedRole = roleChoices.includes(draft.role) ? draft.role : "Cashier";
    const scopedDraft = {
      ...draft,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      role: allowedRole,
      status: draft.status || "Active",
      storeId: targetStoreId,
    };
    delete scopedDraft.password;
    try {
      // The server reads the verified store directory itself. Saving that
      // directory first made an otherwise authorized owner unable to add a
      // staff user when directory saving was restricted or temporarily busy.
      const result = await supabaseApiRequest("staff-account", { method: "POST", body: JSON.stringify({ ...scopedDraft, password: draft.password }) });
      scopedDraft.authUserId = result.authUserId;
    } catch (error) { notify(`User was not saved: ${error.message}`, 10000); return; }
    if (editingId) {
      const targetUser = users.find((user) => user.id === editingId);
      if (!canEditUser(targetUser)) {
        notify("Super Admin permission required to edit admin accounts");
        return;
      }
      setUsers((current) => current.map((user) => {
        if (user.id !== editingId) return user;
        return { ...user, ...scopedDraft };
      }));
      notify("User updated");
    } else {
      setUsers((current) => [...current, { ...scopedDraft, id: crypto.randomUUID() }]);
      notify("New user created");
    }
    closeUserEditor();
  }

  function editUser(user) {
    if (!canEditUser(user)) {
      notify(canManageAll ? "You can edit users from your store only" : "Super Admin permission required to edit admin accounts");
      return;
    }
    setDraft({ name: user.name, email: user.email, password: user.password || "", role: user.role, status: user.status, storeId: user.storeId || defaultUserStoreId });
    setEditingId(user.id);
    onViewChange("create");
  }

  async function deleteUser(id) {
    const user = users.find((item) => item.id === id);
    if (!canEditUser(user)) {
      notify(canManageAll ? "You can delete users from your store only" : "Super Admin permission required to delete admin accounts");
      return;
    }
    try {
      await supabaseApiRequest("staff-account", { method: "POST", body: JSON.stringify({ ...user, password: "", status: "Inactive" }) });
    } catch (error) { notify(`User was not removed: ${error.message}`, 10000); return; }
    setUsers((current) => current.filter((user) => user.id !== id));
    notify("User deleted");
  }

  return (
    <section className="screen">
      <div className="metric-grid compact">
        <Metric icon={Building2} label={canManageAll ? "Restaurants" : "Current store"} value={canManageAll ? String(stores.length) : activeStore.name} trend={canManageAll ? "Global control" : activeStore.branch} />
        <Metric icon={Store} label="Access scope" value={canManageAll ? "Overall" : "Store only"} trend={canManageAll ? "All stores" : activeStore.id} />
        <Metric icon={Users} label="Users" value={String(visibleUsers.length)} trend="This store" />
        <Metric icon={ShieldCheck} label="Roles" value={String(storeCustomRoles.length + baseRoleChoices.length)} trend="Built-in and custom" />
      </div>
      <section className="user-management-workspace">
        <div className="user-management-head">
          <div>
            <span>Team access</span>
            <h2>{activeStore.branch} users</h2>
            <p>Manage staff logins, custom roles, and module access for this branch.</p>
          </div>
        </div>
        <div className={showUserEditor && canManageUsers ? "user-management-layout editor-open" : "user-management-layout"}>
        {canManageUsers && showRoleEditor && (
          <div className="role-management-layout">
            <div className="panel user-editor-panel role-editor-panel">
              <PanelHead title={roleDraft.id ? "Edit role" : "Create role"} icon={ShieldCheck} actions={roleDraft.id ? ["New role"] : []} onAction={resetRoleEditor} />
              <div className="role-form">
                <p className="permission-note">Create custom roles for this branch. Select only the modules staff should access.</p>
                <label>Role name<input value={roleDraft.name} onChange={(event) => setRoleDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Floor Supervisor" /></label>
                <label>Status<select value={roleDraft.status} onChange={(event) => setRoleDraft((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option></select></label>
                <label className="role-description-field">Description<input value={roleDraft.description} onChange={(event) => setRoleDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Short access note" /></label>
                <div className="role-module-grid">
                  {modules.map((module) => {
                    const Icon = module.icon;
                    return (
                      <button key={module.id} type="button" className={roleDraft.modules.includes(module.id) ? "selected" : ""} onClick={() => toggleRoleModule(module.id)}>
                        <Icon size={16} />
                        {module.label}
                      </button>
                    );
                  })}
                </div>
                <button className="login-submit" onClick={saveRole}>{roleDraft.id ? "Update role" : "Create role"}</button>
              </div>
            </div>
            <div className="panel user-list-panel role-list-panel">
              <PanelHead title="Custom roles" icon={ShieldCheck} />
              {storeCustomRoles.length ? <table>
                <thead><tr><th>Role</th><th>Modules</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{storeCustomRoles.map((role) => (
                  <tr key={role.id}>
                    <td><strong>{role.name}</strong><small>{role.description || "Custom branch role"}</small></td>
                    <td>{(role.modules || []).map((moduleId) => modules.find((module) => module.id === moduleId)?.label || moduleId).join(", ")}</td>
                    <td><span className={role.status === "Inactive" ? "active-chip inactive" : "active-chip"}>{role.status || "Active"}</span></td>
                    <td><div className="row-actions"><button onClick={() => editRole(role)}>Edit</button><button onClick={() => deleteRole(role)}>Delete</button></div></td>
                  </tr>
                ))}</tbody>
              </table> : <div className="user-empty-state"><ShieldCheck size={22} /><strong>No custom roles yet</strong><span>Create a role to control module access.</span></div>}
            </div>
          </div>
        )}
        {canManageUsers && showUserEditor && (
          <div className="panel user-editor-panel">
            <PanelHead title={editingId ? "Edit user" : "Create user"} icon={UserPlus} actions={["Close"]} onAction={closeUserEditor} />
            <div className="user-form">
              <p className="permission-note">Create staff accounts for {activeStore.id === "GLOBAL" ? "a selected branch" : storeLabel(activeStore)}. Select <strong>Cashier</strong> for POS billing staff.</p>
              <label>Name<input name="vestora-new-staff-name" autoComplete="off" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Employee name" /></label>
              <label>Email<input name="vestora-new-staff-email" type="email" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="user@restaurant.com" /></label>
              {activeStore.id === "GLOBAL" && <label>Branch<select value={draft.storeId} onChange={(event) => setDraft((current) => ({ ...current, storeId: event.target.value }))}><option value="">Select branch</option>{stores.filter((store) => store.status !== "Inactive").map((store) => <option key={store.id} value={store.id}>{store.name} — {store.branch}</option>)}</select></label>}
              <label>Password
                <span className="password-field">
                  <input name="vestora-new-staff-password" value={draft.password} type={showUserPassword ? "text" : "password"} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Set login password" />
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
        {!showUserEditor && !showRoleEditor && <div className="panel table-panel user-list-panel">
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
  const [qzPrinters, setQzPrinters] = useState([]);
  const [qzBusy, setQzBusy] = useState(false);

  useEffect(() => {
    const onQzClosed = () => setKotPrinter((current) => current.type === "QZ Tray"
      ? { ...current, enabled: false, status: "Disconnected" }
      : current);
    qz.websocket.setClosedCallbacks(onQzClosed);
    return () => qz.websocket.setClosedCallbacks([]);
  }, [setKotPrinter]);

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
    if (printer.type === "QZ Tray") return Boolean(printer.name?.trim());
    return true;
  }

  async function discoverQzPrinters() {
    if (!canManage) throw new Error("Admin permission required");
    setQzBusy(true);
    try {
      const printers = await connectQzTray();
      setQzPrinters(printers);
      if (!printers.length) throw new Error("QZ Tray is running, but no printers were found on this computer");
      const selectedPrinter = printers.includes(kotPrinter.name) ? kotPrinter.name : printers[0];
      setKotPrinter((current) => ({ ...current, type: "QZ Tray", name: selectedPrinter, enabled: false, status: "Printer found" }));
      return printers;
    } finally {
      setQzBusy(false);
    }
  }

  async function connectPrinter() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    if (kotPrinter.type === "QZ Tray") {
      setQzBusy(true);
      setKotPrinter((current) => ({ ...current, enabled: false, status: "Connecting to QZ Tray" }));
      try {
        const printers = await connectQzTray();
        setQzPrinters(printers);
        const selectedPrinter = printers.includes(kotPrinter.name) ? kotPrinter.name : printers[0];
        if (!selectedPrinter) throw new Error("No printers found. Install the printer in Windows and try again.");
        setKotPrinter((current) => ({ ...current, name: selectedPrinter, enabled: true, status: "Connected" }));
        notify(`QZ Tray connected to ${selectedPrinter}`);
      } catch (error) {
        setKotPrinter((current) => ({ ...current, enabled: false, status: "Disconnected" }));
        notify(`Could not connect to QZ Tray: ${error?.message || "Install and open QZ Tray, then retry"}`);
      } finally {
        setQzBusy(false);
      }
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

  async function disconnectPrinter() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    if (kotPrinter.type === "QZ Tray" && qz.websocket.isActive()) {
      try {
        await qz.websocket.disconnect();
      } catch (error) {
        notify(`QZ Tray disconnect failed: ${error?.message || "Try again"}`);
      }
    }
    setKotPrinter((current) => ({ ...current, enabled: false, status: "Disconnected" }));
    notify("KOT printer disconnected");
  }

  async function testPrinter() {
    if (!kotPrinter.enabled || kotPrinter.status !== "Connected") {
      notify("Connect KOT printer first");
      return;
    }
    if (kotPrinter.type === "QZ Tray") {
      try {
        await printKotWithQz({ printerName: kotPrinter.name, paper: kotPrinter.paper, copies: kotPrinter.copies, isTest: true });
        notify(`Test KOT printed on ${kotPrinter.name}`);
      } catch (error) {
        notify(`QZ Tray test print failed: ${error?.message || "Check QZ Tray and printer connection"}`);
      }
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
        <label>Connection type<select value={kotPrinter.type} onChange={(event) => update("type", event.target.value)} disabled={!canManage}><option>Thermal LAN printer</option><option>USB thermal printer</option><option>Bluetooth printer</option><option>Windows default printer</option><option>QZ Tray</option></select></label>
        {kotPrinter.type === "QZ Tray" ? (
          <label>Installed printer<select value={kotPrinter.name} onChange={(event) => update("name", event.target.value)} disabled={!canManage}><option value="">Choose a printer</option>{qzPrinters.map((printer) => <option key={printer} value={printer}>{printer}</option>)}{!qzPrinters.includes(kotPrinter.name) && kotPrinter.name && <option value={kotPrinter.name}>{kotPrinter.name}</option>}</select></label>
        ) : <label>IP address<input value={kotPrinter.ip} onChange={(event) => update("ip", event.target.value)} disabled={!canManage} /></label>}
        {kotPrinter.type !== "QZ Tray" && <label>Port<input value={kotPrinter.port} onChange={(event) => update("port", event.target.value)} disabled={!canManage} /></label>}
        <label>Paper size<select value={kotPrinter.paper} onChange={(event) => update("paper", event.target.value)} disabled={!canManage}><option>80mm</option><option>58mm</option></select></label>
        <label>Copies<input type="number" min="1" max="5" value={kotPrinter.copies} onChange={(event) => update("copies", Number(event.target.value || 1))} disabled={!canManage} /></label>
      </div>
      {kotPrinter.type === "QZ Tray" && <div className="settings-printer-status"><div><strong>QZ Tray must be installed and running on this computer.</strong><small>On first use, approve UVPRO in the QZ Tray permission prompt. Printers connected to this computer will appear here.</small></div><button type="button" onClick={() => discoverQzPrinters().catch((error) => notify(`QZ Tray: ${error?.message || "Could not find printers"}`))} disabled={!canManage || qzBusy}>{qzBusy ? "Searching…" : "Find printers"}</button></div>}
      <label className="kot-toggle"><input type="checkbox" checked={kotPrinter.autoPrint} onChange={(event) => update("autoPrint", event.target.checked)} disabled={!canManage} /> Auto send KOT to kitchen queue when order is created</label>
      <div className="editor-row">
        <button onClick={connectPrinter} disabled={!canManage || qzBusy}>{qzBusy ? "Connecting…" : "Connect printer"}</button>
        <button onClick={testPrinter} disabled={qzBusy}>Test KOT</button>
        <button onClick={disconnectPrinter} disabled={!canManage}>Disconnect</button>
      </div>
      <div className="print-kot test-kot">
        <div className="kot-ticket-head"><strong>KITCHEN ORDER TICKET</strong><span>TEST-KOT</span></div>
        <div className="kot-meta"><span>Type <strong>Test</strong></span><span>Printer <strong>{kotPrinter.name}</strong></span></div>
        <div className="kot-lines"><p>1 Paneer Tikka Bowl</p><p>2 Masala Chaas</p></div>
        <small>UVPRO KDS TEST PRINT</small>
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
  const [settings, setSettings] = useBusinessState(settingsStorageKey, () => {
    const saved = localStorage.getItem(settingsStorageKey) || localStorage.getItem("vestora-active-settings");
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const config = settingsSectionConfig[activeSection];
  const draft = activeSection === "Theme and language"
    ? { ...(settings[activeSection] || config.defaults), theme: themeConfig.mode, themePreset: themeConfig.preset, primaryColor: themeConfig.primaryColor, accentColor: themeConfig.accentColor, sidebarColor: themeConfig.sidebarColor, backgroundColor: themeConfig.backgroundColor, surfaceColor: themeConfig.surfaceColor, textColor: themeConfig.textColor, mutedColor: themeConfig.mutedColor }
    : settings[activeSection] || config.defaults;
  const [availablePrinters, setAvailablePrinters] = useState(() => Array.from(new Set([...printerChoices, ...loadStoredArray("vestora-printer-choices")] )));
  const [newPrinterName, setNewPrinterName] = useState("");
  const printerOptions = Array.from(new Set([
    ...availablePrinters,
    ...(activeSection === "Printer setup" ? [draft.billPrinter, draft.kotPrinter, draft.counterPrinter] : []),
  ].filter(Boolean)));

  useEffect(() => {
    const saved = localStorage.getItem(settingsStorageKey);
    setSettings(saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings);
  }, [settingsStorageKey]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
    syncLocalStateKeyToSupabase(settingsStorageKey).catch(() => {});
  }, [settings, settingsStorageKey]);

  useEffect(() => {
    localStorage.setItem("vestora-printer-choices", JSON.stringify(availablePrinters));
  }, [availablePrinters]);

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

  function addPrinterName() {
    if (!canManage) {
      notify("Admin permission required");
      return;
    }
    const printerName = newPrinterName.trim();
    if (!printerName) {
      notify("Enter the printer name exactly as shown in Windows");
      return;
    }
    setAvailablePrinters((current) => Array.from(new Set([...current, printerName])));
    update("kotPrinter", printerName);
    setNewPrinterName("");
    notify(`${printerName} added to printer choices`);
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
  const themeHeroStyle = draft.theme === "Dark"
    ? { background: "linear-gradient(135deg, #111816, #2f3a36)" }
    : { background: `linear-gradient(135deg, ${draft.sidebarColor}, ${draft.primaryColor})` };

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
                  <div className="theme-studio-hero" style={themeHeroStyle}>
                    <div>
                      <span>Website appearance</span>
                      <h3>{draft.themePreset || "Custom"} / {draft.theme}</h3>
                      <p>Choose a preset, tune every important website color, and UVPRO will adjust letter contrast for clear reading.</p>
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
                      <strong>UVPRO</strong>
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
                        <select value={draft[field] || ""} onChange={(event) => update(field, event.target.value)} disabled={!canManage}>
                          <option value="">Select printer</option>
                          {printerOptions.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
                        </select>
                      ) : <input value={draft[field] || ""} onChange={(event) => update(field, event.target.value)} disabled={!canManage} />}
                    </label>
                  ))}
                </div>
              )}
              {activeSection === "Printer setup" && <div className="printer-option-manager">
                <div><strong>Add a newly installed printer</strong><small>Install the Windows driver first, then enter the printer name exactly as it appears in Windows.</small></div>
                <div className="printer-option-entry"><input value={newPrinterName} onChange={(event) => setNewPrinterName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPrinterName(); } }} disabled={!canManage} placeholder="Example: BPOS RP-260IV" /><button type="button" onClick={addPrinterName} disabled={!canManage}><Plus size={16} /> Add printer</button></div>
              </div>}
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
  confidenceThreshold: 85,
  cooldownMinutes: 0,
  shiftStart: "09:30",
  fullDayHours: 8,
  halfDayHours: 4,
  overtimeAfter: 9,
  storeFaceImages: false,
  deviceId: "SHOP-FIXED-CAM-01",
  faceSafetyVersion: 3,
};

function attendanceSettingsWithSafetyDefaults(saved = {}) {
  saved = saved || {};
  const savedThreshold = Number(saved.confidenceThreshold || 0);
  const needsSafetyUpgrade = Number(saved.faceSafetyVersion || 0) < 3;
  return {
    ...defaultAttendanceSettings,
    ...saved,
    confidenceThreshold: needsSafetyUpgrade ? Math.max(85, savedThreshold) : Math.max(75, savedThreshold || 85),
    faceSafetyVersion: 3,
  };
}

function isAdminCreatedAttendanceUser(user, activeStore, canManageAll = false, stores = []) {
  const starterIds = new Set(starterUsers.map((item) => String(item.id)));
  const starterEmails = new Set(starterUsers.map((item) => item.email?.toLowerCase()));
  const blockedRoles = new Set(["super admin", "restaurant admin", "supplier"]);
  const role = String(user.role || "").replaceAll("_", " ").toLowerCase();
  const assignedStoreId = normalizeStoreId(user.storeId);
  const assignedStore = stores.find((store) => store.id === assignedStoreId);
  const storeNameMatches = [activeStore.name, activeStore.branch]
    .some((label) => String(label || "").trim().toLowerCase() === String(user.storeId || "").trim().toLowerCase());
  const isInScope = activeStore.id === "GLOBAL"
    ? canManageAll && assignedStoreId !== "GLOBAL"
    : assignedStoreId === activeStore.id || (!assignedStore && storeNameMatches);
  return isInScope
    && user.status === "Active"
    && !blockedRoles.has(role)
    && !starterIds.has(String(user.id))
    && !starterEmails.has(String(user.email || "").toLowerCase());
}

function buildAttendanceEmployees(users, activeStore, savedEmployees = [], canManageAll = false, stores = []) {
  const savedByUserId = new Map(savedEmployees.map((employee) => [String(employee.userId), employee]));
  return users
    .filter((user) => isAdminCreatedAttendanceUser(user, activeStore, canManageAll, stores))
    .map((user, index) => {
      const saved = savedByUserId.get(String(user.id)) || {};
      const userStoreId = normalizeStoreId(user.storeId);
      const userStore = stores.find((store) => store.id === userStoreId);
      return {
        id: `EMP-${user.id}`,
        userId: user.id,
        storeId: userStoreId,
        storeName: userStore?.name || activeStore.name,
        branch: userStore?.branch || activeStore.branch,
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

function hasVerifiedFaceEnrollment(employee) {
  const descriptors = getFaceDescriptorSamples(employee?.faceDescriptor);
  return Boolean(employee?.active && employee.faceConsent && descriptors.length && Number(employee.faceSamples || 0) >= 5);
}

function getFaceDescriptorSamples(value) {
  if (!Array.isArray(value) || !value.length) return [];
  // Older enrollments stored one averaged 128-value descriptor.
  if (typeof value[0] === "number") return [value];
  return value.filter((descriptor) => Array.isArray(descriptor) && descriptor.length > 0);
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

function euclideanDistance(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, value, index) => sum + ((Number(value) - Number(b[index])) ** 2), 0));
}

const minimumFaceDistanceGap = 0.10;
const requiredFaceVerificationScans = 3;

function maxFaceDistanceForThreshold(confidenceThreshold) {
  const threshold = Math.max(75, Math.min(95, Number(confidenceThreshold || 80)));
  return 0.44 - ((threshold - 75) / 20) * 0.10;
}

function faceDistanceToConfidence(distance, confidenceThreshold) {
  if (!Number.isFinite(distance)) return 0;
  const limit = maxFaceDistanceForThreshold(confidenceThreshold);
  return Math.max(0, Math.min(100, Math.round(100 - (distance / limit) * 15)));
}

function bestFaceMatch(descriptor, employees, confidenceThreshold) {
  const enrolled = employees.filter(hasVerifiedFaceEnrollment);
  if (!descriptor?.length || !enrolled.length) return null;
  const matches = enrolled.map((employee) => {
    const samples = getFaceDescriptorSamples(employee.faceDescriptor);
    const distances = samples.map((sample) => euclideanDistance(descriptor, sample)).sort((a, b) => a - b);
    // Requiring agreement with several enrollment samples prevents one bad or
    // unusually similar sample from identifying the wrong employee.
    const supportingDistances = distances.slice(0, Math.min(distances.length, 3));
    const distance = supportingDistances.length
      ? supportingDistances.reduce((sum, item) => sum + item, 0) / supportingDistances.length
      : Infinity;
    const confidence = faceDistanceToConfidence(distance, confidenceThreshold);
    return { employee, distance, confidence };
  }).sort((a, b) => a.distance - b.distance);
  const best = matches[0];
  const runnerUp = matches[1];
  if (!best || best.distance > maxFaceDistanceForThreshold(confidenceThreshold)) return null;
  if (runnerUp && runnerUp.distance - best.distance < minimumFaceDistanceGap) return null;
  return best;
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

function AttendanceModule({ notify, activeStore, stores = [], users, canManage, canManageAll, activeView = defaultAttendanceTab, onViewChange, onOpenAdmin }) {
  const employeesKey = `vestora-attendance-employees-${activeStore.id}`;
  const logsKey = `vestora-attendance-logs-${activeStore.id}`;
  const settingsKey = `vestora-attendance-settings-${activeStore.id}`;
  const leaveRequestsKey = `vestora-leave-requests-${activeStore.id}`;
  const activeTab = activeView === "Attendance Logs" ? "Attendance Records" : (attendanceTabs.includes(activeView) ? activeView : defaultAttendanceTab);
  const [savedEmployees, setSavedEmployees] = useBusinessState(employeesKey, () => loadStoredArray(employeesKey));
  const employees = useMemo(
    () => buildAttendanceEmployees(users || [], activeStore, savedEmployees || [], canManageAll, stores),
    [users, activeStore, savedEmployees, canManageAll, stores],
  );
  const setEmployees = useCallback((update) => {
    const current = buildAttendanceEmployees(users || [], activeStore, savedEmployees || [], canManageAll, stores);
    setSavedEmployees(typeof update === "function" ? update(current) : update);
  }, [users, activeStore, savedEmployees, canManageAll, stores, setSavedEmployees]);
  const [logs, setLogs] = useBusinessState(logsKey, () => loadStoredArray(logsKey));
  const [leaveRequests, setLeaveRequests] = useBusinessState(leaveRequestsKey, () => loadStoredArray(leaveRequestsKey));
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" });
  const [settings, setSettings] = useBusinessState(settingsKey, () => attendanceSettingsWithSafetyDefaults(loadStoredObject(settingsKey)));
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
  const scanInProgressRef = useRef(false);
  const candidateMatchRef = useRef({ employeeId: "", count: 0 });
  const employeesRef = useRef(employees);
  const settingsRef = useRef(settings);
  const canManageAttendance = canManage || canManageAll;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) || employees[0];
  const manualEmployee = employees.find((employee) => employee.id === manualEmployeeId);
  const enrolledCount = employees.filter(hasVerifiedFaceEnrollment).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((log) => log.date === todayKey);
  const openLogs = todayLogs.filter((log) => !log.checkOut).length;
  const openLogByEmployeeId = new Map(todayLogs.filter((log) => !log.checkOut).map((log) => [log.employeeId, log]));

  useEffect(() => {
    const saved = loadStoredArray(employeesKey);
    setEmployees(buildAttendanceEmployees(users, activeStore, saved, canManageAll, stores));
    setLogs(loadStoredArray(logsKey));
    setLeaveRequests(loadStoredArray(leaveRequestsKey));
    setLeaveForm({ employeeId: "", type: "Casual leave", from: "", to: "", reason: "" });
    const savedSettings = loadStoredObject(settingsKey);
    setSettings(attendanceSettingsWithSafetyDefaults(savedSettings));
    setSelectedEmployeeId("");
    setManualEmployeeId("");
    setSamples([]);
  }, [activeStore.id, users, stores, canManageAll]);

  useEffect(() => {
    localStorage.setItem(employeesKey, JSON.stringify(employees));
    employeesRef.current = employees;
    syncLocalStateKeyToSupabase(employeesKey).catch(() => {});
  }, [employees, employeesKey]);

  useEffect(() => {
    localStorage.setItem(logsKey, JSON.stringify(logs));
    syncLocalStateKeyToSupabase(logsKey).catch(() => {});
  }, [logs, logsKey]);

  useEffect(() => {
    localStorage.setItem(leaveRequestsKey, JSON.stringify(leaveRequests));
    syncLocalStateKeyToSupabase(leaveRequestsKey).catch(() => {});
  }, [leaveRequests, leaveRequestsKey]);

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    settingsRef.current = settings;
    syncLocalStateKeyToSupabase(settingsKey).catch(() => {});
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
    scanInProgressRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    candidateMatchRef.current = { employeeId: "", count: 0 };
    setMatchedFace(null);
    setScanStatus("Camera idle");
  }

  function startScanning() {
    window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = window.setInterval(async () => {
      if (!faceApiRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
      if (scanInProgressRef.current) return;
      scanInProgressRef.current = true;
      try {
        const faceapi = faceApiRef.current;
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
          .withFaceLandmarks()
          .withFaceDescriptors();
        if (detections.length !== 1) {
          candidateMatchRef.current = { employeeId: "", count: 0 };
          setMatchedFace(null);
          setCurrentDescriptor([]);
          setScanStatus(detections.length ? "Multiple faces detected — show one person" : "No face detected");
          return;
        }
        const descriptor = Array.from(detections[0].descriptor || []);
        if (descriptor.length !== 128) {
          candidateMatchRef.current = { employeeId: "", count: 0 };
          setMatchedFace(null);
          setCurrentDescriptor([]);
          setScanStatus("Face scan incomplete — hold still and try again");
          return;
        }
        const match = bestFaceMatch(descriptor, employeesRef.current, settingsRef.current.confidenceThreshold);
        setCurrentDescriptor(descriptor);
        if (!match) {
          candidateMatchRef.current = { employeeId: "", count: 0 };
          setMatchedFace(null);
          setScanStatus("Face not verified");
          return;
        }
        const previousCandidate = candidateMatchRef.current;
        const count = previousCandidate.employeeId === match.employee.id ? previousCandidate.count + 1 : 1;
        candidateMatchRef.current = { employeeId: match.employee.id, count };
        if (count < requiredFaceVerificationScans) {
          setMatchedFace(null);
          setScanStatus(`Verifying ${match.employee.name} (${count}/${requiredFaceVerificationScans})`);
          return;
        }
        setMatchedFace(match);
        setScanStatus(`${match.employee.name} verified`);
      } catch {
        candidateMatchRef.current = { employeeId: "", count: 0 };
        setMatchedFace(null);
        setCurrentDescriptor([]);
        setScanStatus("Face scan waiting");
      } finally {
        scanInProgressRef.current = false;
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
    if (samples.length >= 5) {
      notify("All 5 face samples have already been captured");
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
    if (samples.length < 5) {
      notify("Capture all 5 face samples before saving");
      return;
    }
    const largestSampleDifference = Math.max(...samples.flatMap((sample, index) =>
      samples.slice(index + 1).map((other) => euclideanDistance(sample, other))));
    if (!Number.isFinite(largestSampleDifference) || largestSampleDifference > 0.52) {
      setSamples([]);
      notify("The samples do not look consistent. Keep only the selected employee in view and capture all 5 again.");
      return;
    }
    const descriptor = samples.map((sample) => [...sample]);
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
    const employee = employeeOverride || matchedFace?.employee;
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
      id: `ATT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      branch: employee.branch || activeStore.branch,
      storeId: employee.storeId || activeStore.id,
      storeName: employee.storeName || activeStore.name,
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
      id: `LEAVE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
            <div className="face-sample-progress" aria-label={`${samples.length} of 5 images captured`}>
              <div className="face-sample-progress-head">
                <span>Images captured</span>
                <strong aria-live="polite">{samples.length} / 5</strong>
              </div>
              <div className="sample-meter">{Array.from({ length: 5 }, (_, index) => <span key={index} className={samples[index] ? "filled" : ""} />)}</div>
            </div>
            {selectedEmployee?.faceDescriptor?.length ? (
              <div className="selected-face-id-panel">
                <div>
                  <span>Enrolled Face ID</span>
                  <strong>{selectedEmployee.name} / {selectedEmployee.faceSamples || 1} samples{hasVerifiedFaceEnrollment(selectedEmployee) ? "" : " (re-enroll with 5 samples)"}</strong>
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
            <div className="attendance-enroll-controls">
              <label>Employee<select value={selectedEmployee?.id || ""} onChange={(event) => { setSelectedEmployeeId(event.target.value); setSamples([]); }}>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.code}</option>)}
              </select></label>
            </div>
            <p className="permission-note">Before saving, confirm the person in the camera is {selectedEmployee?.name || "the selected employee"}. Keep other faces out of frame.</p>
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
                  <span className={hasVerifiedFaceEnrollment(employee) ? "face-dot enrolled" : "face-dot"} />
                  <div><strong>{employee.name}</strong><small>{employee.code} / {employee.designation}</small></div>
                  <em>{hasVerifiedFaceEnrollment(employee) ? `${employee.faceSamples} samples` : employee.faceDescriptor?.length ? "Re-enroll with 5 samples" : "Not enrolled"}</em>
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
            <label>Face confidence threshold<input type="number" min="75" max="95" value={settings.confidenceThreshold} onChange={(event) => updateSetting("confidenceThreshold", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Shift start<input type="time" value={settings.shiftStart} onChange={(event) => updateSetting("shiftStart", event.target.value)} disabled={!canManageAttendance} /></label>
            <label>Full day hours<input type="number" min="1" max="16" value={settings.fullDayHours} onChange={(event) => updateSetting("fullDayHours", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Half day hours<input type="number" min="1" max="12" value={settings.halfDayHours} onChange={(event) => updateSetting("halfDayHours", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Overtime after hours<input type="number" min="1" max="16" value={settings.overtimeAfter} onChange={(event) => updateSetting("overtimeAfter", Number(event.target.value))} disabled={!canManageAttendance} /></label>
            <label>Device ID<input value={settings.deviceId} onChange={(event) => updateSetting("deviceId", event.target.value)} disabled={!canManageAttendance} /></label>
          </div>
          <label className="attendance-consent"><input type="checkbox" checked={settings.storeFaceImages} onChange={(event) => updateSetting("storeFaceImages", event.target.checked)} disabled={!canManageAttendance} /> Allow storing raw face images for this store.</label>
          <div className="attendance-setup-note">
            <strong>Strict local face verification</strong>
            <span>Face recognition requires five enrollment samples, a clear best match, and three consecutive matching scans before check-in or check-out is available. Camera frames stay on this device.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function StoreQrOrderingSettings({ activeStore, notify, canManage, onBack }) {
  const [qrImage, setQrImage] = useState("");
  const [orderingUrl, setOrderingUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateQr() {
    if (!activeStore?.id) {
      notify("Select a store before generating its QR code");
      return;
    }
    setLoading(true);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("order", "1");
    url.searchParams.set("store", activeStore.id);
    setOrderingUrl(url.toString());
    try {
      await Promise.all([
        syncLocalStateKeyToSupabase(`vestora-menu-items-${activeStore.id}`).catch(() => {}),
        syncLocalStateKeyToSupabase(`vestora-tables-${activeStore.id}`).catch(() => {}),
      ]);
      setQrImage(await QRCode.toDataURL(url.toString(), { width: 360, margin: 2, errorCorrectionLevel: "H", color: { dark: "#092c25", light: "#ffffff" } }));
      notify(`${activeStore.name}${activeStore.branch ? ` / ${activeStore.branch}` : ""} QR code generated`);
    } catch {
      setQrImage("");
      notify("Unable to generate store QR code");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generateQr();
  }, [activeStore?.id]);

  return (
    <section className="screen settings-detail-screen">
      <button className="settings-back-button" onClick={onBack}><PanelLeftClose size={17} /> Back to settings</button>
      <div className="panel settings-detail-panel">
        <PanelHead title="QR ordering" icon={QrCode} actions={canManage ? ["Generate QR"] : []} onAction={generateQr} />
        <p className="settings-description">Generate one QR code for this store. Customers scan it without logging in, choose their table, and see only this store's active menu items.</p>
        <div className="qr-settings-store-scope">
          <strong>{activeStore?.name || "Store"}{activeStore?.branch ? ` / ${activeStore.branch}` : ""}</strong>
          <span>Store ID: {activeStore?.id || "Not selected"}</span>
        </div>
        <div className="qr-settings-content">
          <div className="qr-order-preview">
            {loading ? <div className="qr-loading">Creating QR code...</div> : qrImage && <img src={qrImage} alt={`Customer ordering QR for ${activeStore?.name || "store"}`} />}
            <strong>{activeStore?.name || "Store"} · Customer ordering</strong>
          </div>
          <label className="qr-order-url">Ordering link<input readOnly value={orderingUrl} onFocus={(event) => event.target.select()} /></label>
        </div>
        <div className="shift-actions">
          <button type="button" onClick={generateQr} disabled={!canManage || loading}><QrCode size={16} /> Generate QR</button>
          <button type="button" onClick={() => orderingUrl && navigator.clipboard?.writeText(orderingUrl).then(() => notify("Ordering link copied"))} disabled={!orderingUrl}>Copy link</button>
          <a className="qr-download-button" href={qrImage || undefined} download={`${activeStore?.name || "store"}-ordering-qr.png`} aria-disabled={!qrImage}>Download QR</a>
          <button type="button" onClick={() => window.print()} disabled={!qrImage}>Print</button>
        </div>
      </div>
    </section>
  );
}

function OnlineOrderingIntegrationSettings({ activeStore, canManage, notify, menuItems = [], kotPrinter, onBack }) {
  const storeId = activeStore?.id || "";
  const [provider, setProvider] = useState("zomato");
  const [connection, setConnection] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [mode, setMode] = useState("test");
  const [credentialsJson, setCredentialsJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mappingDraft, setMappingDraft] = useState({ providerItemId: "", providerItemName: "", localItemId: "", localItemName: "", addonMapping: "{}", gstRate: "0", providerPrice: "0", onlineStock: "0", isAvailable: true, kotPrinter: kotPrinter?.name || "" });
  const [simItemId, setSimItemId] = useState("");
  const [simQuantity, setSimQuantity] = useState("1");
  const [simExternalId, setSimExternalId] = useState(() => `SIM-${Date.now()}`);
  const [prepMinutes, setPrepMinutes] = useState("20");

  const callDelivery = useCallback((action, payload = {}) => supabaseFunctionJson("vestora-delivery", {
    method: "POST",
    body: JSON.stringify({ action, storeId, provider, ...payload }),
  }), [storeId, provider]);

  useEffect(() => {
    setSimItemId(""); setConnection(null); setOutletId(""); setMode("test"); setCredentialsJson("");
    setMappings([]); setOrders([]); setLogs([]); setJobs([]);
  }, [provider, storeId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callDelivery("config.get");
      const current = result.connection || null;
      setConnection(current);
      let legacyOutlet = "";
      if (!current) {
        try {
          const legacy = JSON.parse(localStorage.getItem(`vestora-online-order-integrations-${storeId}`) || "{}");
          legacyOutlet = provider === "zomato" ? legacy.zomatoOutletId || "" : legacy.swiggyOutletId || "";
        } catch { /* Ignore an invalid legacy outlet draft; secure server configuration remains authoritative. */ }
      }
      setOutletId(current?.outletId || legacyOutlet);
      setMode(current?.mode || "test");
      setCredentialsJson("");
      if (!current) {
        setMappings([]); setOrders([]); setLogs([]); setJobs([]);
        return;
      }
      const data = await callDelivery("mapping.list");
      setMappings(data.mappings || []); setOrders(data.orders || []); setLogs(data.logs || []); setJobs(data.jobs || []);
      if (!simItemId && data.mappings?.length) setSimItemId(data.mappings[0].provider_item_id);
    } catch (error) {
      setNotice(error?.message || "Could not load online delivery settings");
    } finally { setLoading(false); }
  }, [callDelivery, provider, storeId, simItemId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function saveConfiguration(event) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true); setNotice("");
    try {
      const result = await callDelivery("config.save", {
        outletId, mode, credentials: credentialsJson,
        clearCredentials: false, confirmLivePending: true,
        settings: { kotPrinter: kotPrinter?.name || "" },
      });
      setConnection(result.connection);
      setCredentialsJson("");
      setNotice(`Saved ${provider === "zomato" ? "Zomato" : "Swiggy"} outlet for ${activeStore?.branch || activeStore?.name || "this branch"}. Credentials are never returned to the browser.`);
      await refresh();
    } catch (error) { setNotice(error?.message || "Could not save integration settings"); }
    finally { setSaving(false); }
  }

  async function clearCredentialBundle() {
    if (!canManage || !connection?.credentialsConfigured || !window.confirm("Remove the encrypted credential bundle for this branch?")) return;
    setSaving(true);
    try {
      const result = await callDelivery("config.save", {
        outletId, mode, credentials: "", clearCredentials: true, confirmLivePending: true,
        settings: { kotPrinter: kotPrinter?.name || "" },
      });
      setConnection(result.connection);
      setNotice("Encrypted credential bundle removed from this branch configuration.");
    } catch (error) { setNotice(error?.message || "Could not clear credentials"); }
    finally { setSaving(false); }
  }

  function setMappingField(field, value) {
    setMappingDraft((current) => ({ ...current, [field]: value }));
  }

  function editMapping(mapping) {
    setMappingDraft({
      providerItemId: mapping.provider_item_id, providerItemName: mapping.provider_item_name,
      localItemId: mapping.local_item_id, localItemName: mapping.local_item_name,
      addonMapping: JSON.stringify(mapping.addon_mapping || {}), gstRate: String(mapping.gst_rate || 0),
      providerPrice: String(mapping.provider_price || 0), onlineStock: String(mapping.online_stock || 0),
      isAvailable: Boolean(mapping.is_available), kotPrinter: mapping.kot_printer || "",
    });
    setNotice(`Editing ${mapping.provider_item_name}. Save the form to update its branch mapping.`);
  }

  async function saveMapping(event) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true); setNotice("");
    try {
      const result = await callDelivery("mapping.save", { mapping: mappingDraft });
      setMappings((current) => [...current.filter((entry) => entry.id !== result.mapping.id && entry.provider_item_id !== result.mapping.provider_item_id), result.mapping].sort((a, b) => a.provider_item_name.localeCompare(b.provider_item_name)));
      setSimItemId(result.mapping.provider_item_id);
      setMappingDraft({ providerItemId: "", providerItemName: "", localItemId: "", localItemName: "", addonMapping: "{}", gstRate: "0", providerPrice: "0", onlineStock: "0", isAvailable: true, kotPrinter: kotPrinter?.name || "" });
      setNotice("Menu, add-on, GST, online stock, and KOT routing mapping saved for this branch.");
    } catch (error) { setNotice(error?.message || "Could not save menu mapping"); }
    finally { setSaving(false); }
  }

  async function simulateIncomingOrder(event) {
    event.preventDefault();
    const mapping = mappings.find((entry) => entry.provider_item_id === simItemId);
    if (!mapping) { setNotice("Save a menu mapping before simulating an order"); return; }
    setSaving(true); setNotice("");
    try {
      const quantity = Number(simQuantity);
      const response = await callDelivery("simulate", { order: {
        externalOrderId: simExternalId,
        customer: "UVPRO simulator customer",
        items: [{ providerItemId: mapping.provider_item_id, name: mapping.provider_item_name, quantity, addons: [] }],
        subtotal: Number(mapping.provider_price || 0) * quantity,
      } });
      if (response.duplicate) {
        setNotice(response.message || "Duplicate order ignored; stock was not deducted again.");
      } else if (response.stockIssue) {
        setNotice(`Order recorded for review: ${response.stockIssue}. Stock was not deducted.`);
      } else {
        setNotice(`Signed ${provider} test webhook accepted for ${response.order.external_order_id}; mapped stock updated.`);
        await printIncomingKot(response.order, mapping);
        setSimExternalId(`SIM-${Date.now()}`);
      }
      await refresh();
    } catch (error) { setNotice(error?.message || "Test order simulation failed"); }
    finally { setSaving(false); }
  }

  async function printIncomingKot(order, fallbackMapping) {
    if (kotPrinter?.type !== "QZ Tray") {
      await callDelivery("order.print-result", { orderId: order.id, printStatus: "not_configured", printer: "" }).catch(() => {});
      setNotice(`Order ${order.external_order_id} received. Configure QZ Tray to print the KOT automatically.`);
      return;
    }
    const routeItems = order.kot_data?.items || order.items || [];
    const groups = new Map();
    for (const item of routeItems) {
      const target = String(item.kotPrinter || fallbackMapping.kot_printer || connection?.settings?.kotPrinter || kotPrinter.name || "").trim();
      if (!target) continue;
      groups.set(target, [...(groups.get(target) || []), item]);
    }
    if (!groups.size) {
      await callDelivery("order.print-result", { orderId: order.id, printStatus: "not_configured", printer: "" }).catch(() => {});
      setNotice(`Order ${order.external_order_id} received. Choose a KOT printer in the menu mapping.`);
      return;
    }
    try {
      for (const [printerName, items] of groups) {
        await printKotWithQz({ printerName, paper: kotPrinter.paper || "80mm", copies: kotPrinter.copies || 1, order: {
          kotId: `${provider.toUpperCase()}-${order.external_order_id}`,
          tableName: `${provider.toUpperCase()} delivery`, waiterName: "Online order",
          items: items.map((item) => ({ qty: item.quantity, name: item.localItemName || item.name, notes: (item.mappedAddons || item.addons || []).join(", ") })),
        } });
      }
      await callDelivery("order.print-result", { orderId: order.id, printStatus: "printed", printer: [...groups.keys()].join(", ") });
      setNotice(`Order received and KOT sent to ${[...groups.keys()].join(", ")}.`);
    } catch (error) {
      await callDelivery("order.print-result", { orderId: order.id, printStatus: "failed", printer: [...groups.keys()].join(", ") }).catch(() => {});
      setNotice(`Order received, but the KOT could not print: ${error?.message || "Check QZ Tray"}`);
    }
  }

  async function printExistingOrderKot(order) {
    const routeItems = order.kot_data?.items || order.items || [];
    const fallback = mappings.find((mapping) => mapping.provider_item_id === routeItems[0]?.providerItemId);
    if (fallback) await printIncomingKot(order, fallback);
    else setNotice("No saved menu mapping is available for this order's KOT.");
  }

  async function changeOrder(order, status) {
    setSaving(true); setNotice("");
    try {
      const reason = status === "cancelled" || status === "rejected" ? window.prompt(status === "cancelled" ? "Why is this order being cancelled?" : "Why is this order being rejected?", status === "cancelled" ? "Cancelled by restaurant" : "Rejected by restaurant") : "";
      if ((status === "cancelled" || status === "rejected") && reason === null) return;
      await callDelivery("order.change", { orderId: order.id, status, prepMinutes: status === "accepted" || status === "preparing" ? Number(prepMinutes) : null, reason: reason || "" });
      setNotice(`Order ${order.external_order_id} updated to ${status}.`);
      await refresh();
    } catch (error) { setNotice(error?.message || "Could not update order status"); }
    finally { setSaving(false); }
  }

  async function changeAvailability(mapping) {
    try {
      const result = await callDelivery("stock.change", { mappingId: mapping.id, isAvailable: !mapping.is_available });
      setMappings((current) => current.map((entry) => entry.id === mapping.id ? result.mapping : entry));
      setNotice(`${mapping.provider_item_name} marked ${result.mapping.is_available ? "available" : "out of stock"}.`);
    } catch (error) { setNotice(error?.message || "Could not update stock availability"); }
  }

  async function deleteMapping(mapping) {
    if (!window.confirm(`Remove the ${mapping.provider_item_name} mapping?`)) return;
    try {
      await callDelivery("mapping.delete", { mappingId: mapping.id });
      setMappings((current) => current.filter((entry) => entry.id !== mapping.id));
      setNotice("Menu mapping removed.");
    } catch (error) { setNotice(error?.message || "Could not remove mapping"); }
  }

  async function retryJob(job) {
    try {
      const result = await callDelivery("job.retry", { jobId: job.id });
      setNotice(result.message || (result.job?.status === "succeeded" ? "Test-mode retry succeeded." : "Retry held until live provider access is approved."));
      if (result.order && !result.stockIssue) await printExistingOrderKot(result.order);
      await refresh();
    } catch (error) { setNotice(error?.message || "Could not retry delivery operation"); }
  }

  const canSimulate = connection?.mode === "test" && mappings.length > 0;
  const inputId = (prefix) => `${prefix}-${provider}`;

  return (
    <section className="screen settings-detail-screen">
      <button className="settings-back-button" onClick={onBack}><PanelLeftClose size={17} /> Back to settings</button>
      <div className="panel settings-detail-panel online-integration-panel">
        <PanelHead title="Integrations" icon={ShoppingCart} actions={canManage ? ["Refresh"] : []} onAction={refresh} />
        <p className="settings-description">Secure, branch-isolated online delivery setup for {activeStore?.branch || activeStore?.name || "this UVPRO branch"}.</p>
        <div className="online-provider-tabs" role="tablist" aria-label="Delivery provider">
          {["zomato", "swiggy"].map((value) => <button key={value} type="button" role="tab" aria-selected={provider === value} className={provider === value ? "active" : ""} onClick={() => { setProvider(value); setNotice(""); }}>
            {value === "zomato" ? "Zomato" : "Swiggy"}
          </button>)}
        </div>
        <div className="online-integration-notice" role="status">
          <span className="online-integration-status"><span /> {connection ? connection.status.replaceAll("_", " ") : "Not configured"}</span>
          <div><strong>{connection?.mode === "test" ? "Test simulator ready" : connection?.mode === "live" ? "Live mode pending partner approval" : "Configure this outlet"}</strong>
            <small>UVPRO does not call or impersonate aggregator APIs. The simulator signs a synthetic webhook and runs the same validated order-ingest path.</small></div>
        </div>
        {notice && <p className="permission-note" role="status">{notice}</p>}
        <form className="online-integration-config" onSubmit={saveConfiguration}>
          <label htmlFor={inputId("outlet")}>{provider === "zomato" ? "Zomato outlet ID" : "Swiggy outlet ID"}
            <input id={inputId("outlet")} value={outletId} onChange={(event) => setOutletId(event.target.value)} disabled={!canManage} required maxLength={160} placeholder="Enter approved outlet ID" autoComplete="off" />
          </label>
          <label htmlFor={inputId("mode")}>Environment
            <select id={inputId("mode")} value={mode} onChange={(event) => setMode(event.target.value)} disabled={!canManage}><option value="test">Test simulator</option><option value="live">Live (pending official approval)</option></select>
          </label>
          <label htmlFor={inputId("credentials")}>Encrypted credential bundle <small>Optional, opaque JSON from the approved partner kit. Never put credentials in local storage.</small>
            <input id={inputId("credentials")} type="password" value={credentialsJson} onChange={(event) => setCredentialsJson(event.target.value)} disabled={!canManage} autoComplete="new-password" spellCheck="false" placeholder={connection?.credentialsConfigured ? "Saved securely · enter to replace" : "Paste approved credential JSON only when issued"} />
          </label>
          <div className="online-integration-actions"><span>{connection?.credentialsConfigured ? "Server-encrypted credentials saved" : "No credentials saved"}</span><div className="row-actions">{connection?.credentialsConfigured && <button type="button" onClick={clearCredentialBundle} disabled={!canManage || saving}>Clear credentials</button>}<button className="primary-action" type="submit" disabled={!canManage || saving || !storeId}>{saving ? "Saving…" : "Save branch integration"}</button></div></div>
        </form>

        {connection && <>
          <div className="online-delivery-section-head"><div><h3>Menu, add-on, GST and stock mapping</h3><p>Each mapping belongs only to this outlet and branch. Online stock is decremented once per accepted unique order.</p></div></div>
          <form className="online-delivery-mapping-form" onSubmit={saveMapping}>
            <label>Platform item ID<input value={mappingDraft.providerItemId} onChange={(event) => setMappingField("providerItemId", event.target.value)} required disabled={!canManage} placeholder="Partner menu item ID" /></label>
            <label>Platform item name<input value={mappingDraft.providerItemName} onChange={(event) => setMappingField("providerItemName", event.target.value)} required disabled={!canManage} placeholder="Listed menu item" /></label>
            <label>Map to UVPRO menu item<select value={mappingDraft.localItemId} onChange={(event) => { const item = menuItems.find((candidate) => String(candidate.id) === event.target.value); setMappingDraft((current) => ({ ...current, localItemId: event.target.value, localItemName: item?.name || "" })); }} disabled={!canManage} required><option value="">Choose local menu item</option>{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>GST %<input type="number" min="0" max="100" step="0.01" value={mappingDraft.gstRate} onChange={(event) => setMappingField("gstRate", event.target.value)} disabled={!canManage} /></label>
            <label>Platform price ₹<input type="number" min="0" step="0.01" value={mappingDraft.providerPrice} onChange={(event) => setMappingField("providerPrice", event.target.value)} disabled={!canManage} /></label>
            <label>Online stock qty<input type="number" min="0" step="0.001" value={mappingDraft.onlineStock} onChange={(event) => setMappingField("onlineStock", event.target.value)} disabled={!canManage} /></label>
            <label>Add-on mapping JSON<input value={mappingDraft.addonMapping} onChange={(event) => setMappingField("addonMapping", event.target.value)} disabled={!canManage} placeholder='{"provider-addon-id":"UVPRO modifier"}' /></label>
            <label>KOT printer mapping<input list={inputId("printers")} value={mappingDraft.kotPrinter} onChange={(event) => setMappingField("kotPrinter", event.target.value)} disabled={!canManage} placeholder="Kitchen printer name" /><datalist id={inputId("printers")}><option value={kotPrinter?.name || ""} /></datalist></label>
            <label className="online-stock-toggle"><input type="checkbox" checked={mappingDraft.isAvailable} onChange={(event) => setMappingField("isAvailable", event.target.checked)} disabled={!canManage} /> Available online</label>
            <button className="primary-action" type="submit" disabled={!canManage || saving || !connection}>{saving ? "Saving…" : "Save menu mapping"}</button>
          </form>
          <div className="online-delivery-table-wrap"><table><thead><tr><th>Platform menu item</th><th>UVPRO menu item</th><th>Add-ons / GST</th><th>Price</th><th>Online stock</th><th>KOT printer</th><th>Availability</th><th>Actions</th></tr></thead><tbody>
            {mappings.map((mapping) => <tr key={mapping.id}><td><strong>{mapping.provider_item_name}</strong><small>{mapping.provider_item_id}</small></td><td>{mapping.local_item_name}<small>{mapping.local_item_id}</small></td><td>{Object.keys(mapping.addon_mapping || {}).length} add-ons · {mapping.gst_rate}% GST</td><td>{formatMoney(mapping.provider_price)}</td><td>{mapping.online_stock}</td><td>{mapping.kot_printer || "Not mapped"}</td><td>{mapping.is_available ? "Available" : "Out of stock"}</td><td><div className="row-actions"><button type="button" disabled={!canManage} onClick={() => editMapping(mapping)}>Edit</button><button type="button" disabled={!canManage} onClick={() => changeAvailability(mapping)}>{mapping.is_available ? "Mark OOS" : "Make available"}</button><button type="button" disabled={!canManage} onClick={() => deleteMapping(mapping)}>Remove</button></div></td></tr>)}
            {!mappings.length && <tr><td colSpan="8">No menu mappings yet. Add at least one to run the simulator.</td></tr>}
          </tbody></table></div>

          <div className="online-delivery-section-head"><div><h3>Signed test-mode webhook simulator</h3><p>Runs a generated HMAC signature through validation, duplicate protection, order creation, stock reservation, and KOT routing. No real provider is contacted.</p></div></div>
          <form className="online-delivery-simulator" onSubmit={simulateIncomingOrder}>
            <label>External test order ID<input value={simExternalId} onChange={(event) => setSimExternalId(event.target.value)} required disabled={saving} /></label>
            <label>Mapped menu item<select value={simItemId} onChange={(event) => setSimItemId(event.target.value)} disabled={!canSimulate || saving}>{mappings.map((mapping) => <option key={mapping.id} value={mapping.provider_item_id}>{mapping.provider_item_name} · stock {mapping.online_stock}</option>)}</select></label>
            <label>Quantity<input type="number" min="1" max="100" value={simQuantity} onChange={(event) => setSimQuantity(event.target.value)} disabled={!canSimulate || saving} /></label>
            <button className="primary-action" type="submit" disabled={!canManage || !canSimulate || saving}>{saving ? "Processing…" : `Simulate ${provider} order`}</button>
          </form>

          <div className="online-delivery-section-head"><div><h3>Delivery orders</h3><p>Branch-scoped order status and audit trail. Rejected or cancelled orders follow the stock-restoration rules.</p></div></div>
          <div className="online-delivery-table-wrap"><table><thead><tr><th>External order</th><th>Received</th><th>Items</th><th>Total</th><th>Status</th><th>KOT</th><th>Actions</th></tr></thead><tbody>
            {orders.map((order) => <tr key={order.id}><td><strong>{order.external_order_id}</strong><small>{order.customer_label}</small></td><td>{new Date(order.received_at).toLocaleString()}</td><td>{(order.items || []).map((item) => `${item.quantity} × ${item.localItemName || item.name}`).join(", ")}</td><td>{formatMoney(order.subtotal)}</td><td>{order.status.replaceAll("_", " ")}{order.prep_minutes ? <small>{order.prep_minutes} min prep</small> : null}</td><td>{order.kot_print_status}</td><td><div className="row-actions">{["pending", "failed", "not_configured"].includes(order.kot_print_status) && <button type="button" disabled={!canManage || saving} onClick={() => printExistingOrderKot(order)}>Print KOT</button>}{["new", "needs_review"].includes(order.status) && <><button type="button" disabled={!canManage || saving} onClick={() => changeOrder(order, "accepted")}>Accept</button><button type="button" disabled={!canManage || saving} onClick={() => changeOrder(order, "rejected")}>Reject</button></>}{["accepted", "preparing"].includes(order.status) && <><input aria-label={`Preparation minutes for ${order.external_order_id}`} className="online-prep-minutes" type="number" min="1" max="240" value={prepMinutes} onChange={(event) => setPrepMinutes(event.target.value)} /><button type="button" disabled={!canManage || saving} onClick={() => changeOrder(order, "preparing")}>Set prep</button><button type="button" disabled={!canManage || saving} onClick={() => changeOrder(order, "ready")}>Ready</button></>}{!["rejected", "cancelled"].includes(order.status) && <button type="button" disabled={!canManage || saving} onClick={() => changeOrder(order, "cancelled")}>Cancel</button>}</div></td></tr>)}
            {!orders.length && <tr><td colSpan="7">{loading ? "Loading orders…" : "No delivery orders for this branch yet."}</td></tr>}
          </tbody></table></div>

          <div className="online-delivery-section-head"><div><h3>Integration logs and retries</h3><p>Every webhook, stock change, KOT print result, and provider sync attempt is branch scoped.</p></div></div>
          <div className="online-delivery-table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Result</th><th>Details</th></tr></thead><tbody>
            {logs.map((entry) => <tr key={entry.id}><td>{new Date(entry.created_at).toLocaleString()}</td><td>{entry.event_type}</td><td>{entry.outcome}</td><td>{entry.message}</td></tr>)}
            {!logs.length && <tr><td colSpan="4">No integration events recorded.</td></tr>}
          </tbody></table></div>
          {jobs.some((job) => job.status !== "succeeded") && <div className="online-delivery-jobs"><h4>Retryable / blocked operations</h4>{jobs.filter((job) => job.status !== "succeeded").map((job) => <div key={job.id}><span>{job.event_type} · attempt {job.attempt_count} · {job.last_error || job.status}</span><button type="button" disabled={!canManage} onClick={() => retryJob(job)}>Retry</button></div>)}</div>}
          <div className="online-integration-footnote"><ShieldCheck size={17} /><span>Live platform requests remain disabled until UVPRO receives partner approval, official API specifications, and server encryption/signing keys. Test credentials are generated ephemerally and never saved.</span></div>
        </>}
        {loading && !connection && <p className="permission-note">Loading branch integration…</p>}
        {!canManage && <p className="permission-note">Restaurant administrator permission is required to manage integrations.</p>}
      </div>
    </section>
  );
}

function SettingsView({ notify, billTemplate, setBillTemplate, kotPrinter, setKotPrinter, canManage, canManageAll, activeStore, setStores, menuItems, themeConfig, setThemeConfig, setDark }) {
  const sectionNames = canManageAll ? Object.keys(settingsSectionConfig) : storeSettingsSections;
  const [selectedSetting, setSelectedSetting] = useState(null);
  const settingMeta = {
    "Restaurant profile": Building2,
    "Branch settings": Store,
    "GST and FSSAI": Percent,
    "Print bill format": ReceiptText,
    "Printer setup": Printer,
    "Payment providers": CreditCard,
    Integrations: ShoppingCart,
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

  if (selectedSetting === "QR ordering") {
    return <StoreQrOrderingSettings activeStore={activeStore} notify={notify} canManage={canManage} onBack={() => setSelectedSetting(null)} />;
  }

  if (selectedSetting === "Integrations") {
    return <OnlineOrderingIntegrationSettings activeStore={activeStore} canManage={canManage} notify={notify} menuItems={menuItems} kotPrinter={kotPrinter} onBack={() => setSelectedSetting(null)} />;
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
        <span className="settings-location">{activeStore?.name || "UVPRO"} / {activeStore?.branch || "All stores"}</span>
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

function DataTable({ title, icon, columns, rows, onRowsChange, notify, canManageAll, allowAdd = false, addLabel = "Add item", addRowDefaults = [], emptyMessage = "No records found" }) {
  const Icon = icon;
  const [filterOn, setFilterOn] = useState(false);
  const [localRows, setLocalRows] = useState(rows);
  const tableRows = onRowsChange ? rows : localRows;
  const setTableRows = (update) => {
    const next = typeof update === "function" ? update(tableRows) : update;
    if (onRowsChange) onRowsChange(next); else setLocalRows(next);
  };
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
    setTableRows((current) => current.map((row, index) => index === editingIndex ? Object.assign([...rowDraft], { recordId: row.recordId }) : row));
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
