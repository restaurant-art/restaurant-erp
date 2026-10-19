// Local visual smoke test. All API traffic is intercepted; no production records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/aswin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || 'node_modules/.design-tools/screenshots');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errors = [];
  const profile = { id: 'design-review', name: 'Alex Morgan', email: 'review@example.test', role: 'restaurant_admin', appRole: 'Restaurant Admin', isSuperuser: false, storeId: 'QA-DESIGN', allowedStoreIds: ['QA-DESIGN'] };
  const stores = [{ id: 'QA-DESIGN', name: 'The Green Table', branch: 'Indiranagar', status: 'Active', type: 'Store', address: 'Design preview only' }];
  const rows = new Map();
  const put = (key, value) => rows.set(key, { state_key: key, state_value: value, updated_at: '1' });
  put('vestora-stores', stores);
  put('vestora-users', [{ id: 'qa-cashier', name: 'Jordan Lee', email: 'cashier@example.test', role: 'Cashier', storeId: 'QA-DESIGN', status: 'Active' }]);
  put('vestora-inventory-QA-DESIGN', [{ id: 'QA-RICE', name: 'Basmati rice', sku: 'RICE-001', barcode: '890987654321', category: 'Grains', unit: 'kg', stock: 42, reorder: 10, price: 120, cost: 126, sellingPrice: 150, gstRate: 5, updatedAt: new Date().toISOString() }]);
  put('vestora-inventory-vendors-QA-DESIGN', [{ id: 'qa-vendor', name: 'QA Supplier' }]);
  put('vestora-menu-items-QA-DESIGN', [{ id: 'QA-MENU', name: 'Garden grain bowl', category: 'Mains', price: 280, tax: 5, status: 'Active' }]);
  put('vestora-sales-ledger', Array.from({ length: 24 }, (_, i) => ({ id: `QA-BILL-${i}`, billNo: `QA-${i}`, storeId: 'QA-DESIGN', createdAt: new Date().toISOString(), total: 420 + i * 40, orderType: i % 3 ? 'Dine-in' : 'Takeaway', payment: i % 2 ? 'UPI' : 'Card', items: [{ id: 'QA-MENU', name: 'Garden grain bowl', qty: 2, price: 280 }] })));
  let revision = 1;
  async function contextFor(authenticated, viewport, superAdmin = false) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const sessionProfile = superAdmin ? { ...profile, role: 'super_admin', appRole: 'Super Admin', isSuperuser: true } : profile;
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let data = [];
      if (url.pathname.endsWith('/profile/')) data = sessionProfile;
      else if (url.pathname.endsWith('/state/')) {
        if (request.method() === 'PUT') {
          const body = request.postDataJSON();
          data = { state_key: body.key, state_value: body.value, updated_at: String(++revision) };
          rows.set(body.key, data);
        } else data = url.searchParams.has('key') ? [rows.get(url.searchParams.get('key'))].filter(Boolean) : [...rows.values()];
      } else if (url.pathname.endsWith('/cashier-login/')) data = rows.get('vestora-users').state_value[0];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    if (authenticated) await context.addInitScript(({ profile }) => {
      localStorage.setItem('uvpro-aws-session', JSON.stringify({ access_token: 'local-preview', refresh_token: 'local-preview', user: { id: profile.id, email: profile.email, user_metadata: { name: profile.name }, app_metadata: { vestora: profile } } }));
      localStorage.setItem('vestora-selected-store', 'QA-DESIGN');
    }, { profile: sessionProfile });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    return page;
  }
  const capture = async (page, name) => {
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) console.log(name, await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2).slice(0, 20).map(e => ({ tag: e.tagName, class: e.className, right: e.getBoundingClientRect().right }))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: page overflows horizontally`);
  };
  try {
    const login = await contextFor(false, { width: 1440, height: 1000 });
    await login.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    await capture(login, 'login-desktop');
    await login.setViewportSize({ width: 390, height: 844 });
    await capture(login, 'login-mobile');
    const page = await contextFor(true, { width: 1440, height: 1000 });
    await page.getByRole('heading', { name: 'Your business, at a glance.' }).waitFor();
    await page.waitForFunction(() => window.vestoraCloudStateReady === true);
    await capture(page, 'dashboard-desktop');
    if (process.env.CHECK_PRODUCT_GST_ENTER === '1') {
      const productPage = await contextFor(true, { width: 1440, height: 1000 });
      await productPage.getByRole('navigation').getByRole('button', { name: 'Inventory', exact: true }).click();
      await productPage.getByRole('navigation').getByRole('button', { name: 'Product Master', exact: true }).click();
      const productDialog = productPage.getByRole('dialog', { name: /product/i });
      await productDialog.getByRole('heading', { name: 'New product', exact: true }).waitFor();
      const gstRate = productDialog.getByRole('combobox', { name: 'GST rate', exact: true });
      await gstRate.focus();
      await gstRate.press('Enter');
      assert.equal(await productPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Price before GST');
      await capture(productPage, 'product-gst-enter-focus');
      await productPage.context().close();
      console.log('PASS: Enter on Product Master GST moves focus to Price before GST.');
      if (process.env.ONLY_PRODUCT_GST_ENTER === '1') {
        assert.deepEqual(errors, [], 'product GST keyboard browser errors');
        return;
      }
    }
    if (process.env.CHECK_PURCHASE_INVOICE_REQUIRED === '1') {
      const originalRows = new Map(rows);
      const purchasePage = await contextFor(true, { width: 1440, height: 1000 });
      await purchasePage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const purchaseDialog = purchasePage.locator('.purchase-entry-modal');
      if (!await purchaseDialog.isVisible()) {
        await purchasePage.getByRole('navigation').getByRole('button', { name: 'Purchase entry', exact: true }).click();
        await purchasePage.getByRole('button', { name: 'Add purchase entry', exact: true }).first().click();
      }
      await purchaseDialog.waitFor();
      const invoice = purchaseDialog.getByRole('textbox', { name: 'Supplier invoice number', exact: true });
      assert.equal(await invoice.getAttribute('required'), '', 'supplier invoice input is browser-required');
      await purchaseDialog.getByRole('button', { name: 'Save draft', exact: true }).click();
      await purchasePage.locator('.toast').filter({ hasText: 'Supplier invoice number is required' }).waitFor();
      assert.ok(await purchaseDialog.isVisible(), 'blank invoice keeps the purchase editor open');
      await invoice.fill('INV-REQUIRED-1');
      await purchaseDialog.getByRole('button', { name: 'Save draft', exact: true }).click();
      await purchasePage.locator('.toast').filter({ hasText: 'Purchase draft saved' }).waitFor();
      await purchasePage.getByText('INV-REQUIRED-1', { exact: true }).waitFor();
      assert.equal(await purchaseDialog.count(), 0, 'valid invoice closes the purchase editor after saving');
      await capture(purchasePage, 'purchase-entry-invoice-required');
      await purchasePage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Purchase Entry requires a supplier invoice number before saving a draft.');
      if (process.env.ONLY_PURCHASE_INVOICE_REQUIRED === '1') {
        assert.deepEqual(errors, [], 'purchase invoice required browser errors');
        return;
      }
    }
    if (process.env.CHECK_PURCHASE_DRAFT_LIMIT === '1') {
      const originalRows = new Map(rows);
      put('vestora-active-settings-QA-DESIGN', { 'Purchase controls': { maximumDraftDays: '3' } });
      put('vestora-purchase-drafts-QA-DESIGN', [{
        id: 'PUR-DRAFT-OVERDUE', purchaseNumber: 'PUR-20200101-000001', status: 'Draft', createdAt: '2020-01-01T08:00:00.000Z', updatedAt: '2020-01-01T08:00:00.000Z',
        entry: { supplier: 'QA Supplier', invoice: 'INV-OVERDUE', date: '2020-01-01', notes: '', lines: [] },
      }]);
      const draftLimitPage = await contextFor(true, { width: 1440, height: 1000 });
      await draftLimitPage.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
      await draftLimitPage.getByRole('button', { name: /Purchase controls.*Control how long/i }).click();
      const daysInput = draftLimitPage.getByRole('spinbutton', { name: 'Maximum purchase draft days', exact: true });
      assert.equal(await daysInput.inputValue(), '3');
      await daysInput.fill('5');
      await draftLimitPage.getByRole('button', { name: 'Save settings', exact: true }).click();
      await draftLimitPage.locator('.toast').filter({ hasText: 'flagged overdue after 5 days' }).waitFor();
      await draftLimitPage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await draftLimitPage.getByRole('heading', { name: 'Purchase entries', exact: true }).waitFor();
      assert.match(await draftLimitPage.getByRole('region', { name: 'Purchase entries', exact: true }).innerText(), /Draft limit: 5 days.*1 overdue.*INV-OVERDUE.*Draft overdue.*overdue/is);
      await capture(draftLimitPage, 'purchase-draft-maximum-days');
      await draftLimitPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Settings controls the maximum purchase draft age and Purchase Entry flags overdue drafts.');
      if (process.env.ONLY_PURCHASE_DRAFT_LIMIT === '1') {
        assert.deepEqual(errors, [], 'purchase draft limit browser errors');
        return;
      }
    }
    if (process.env.CHECK_PURCHASE_ORDER_LINK === '1') {
      const originalRows = new Map(rows);
      const rice = rows.get('vestora-inventory-QA-DESIGN').state_value[0];
      const oil = { id: 'QA-OIL', name: 'Cooking oil', sku: 'OIL-001', barcode: '890100000002', category: 'Dry goods', unit: 'ltr', stock: 10, reorder: 3, price: 76.19, cost: 80, sellingPrice: 100, gstRate: 5, updatedAt: new Date().toISOString() };
      put('vestora-inventory-QA-DESIGN', [rice, oil]);
      put('vestora-inventory-vendors-QA-DESIGN', [{ id: 'VEN-PO-LINK', name: 'QA Supplier', gstin: '', phone: '', email: '', address: '' }]);
      put('vestora-purchase-orders-QA-DESIGN', [{
        id: 'PO-LINK', poNumber: 'PO-20261017-777', vendor: 'QA Supplier', orderDate: '2026-10-17', expectedDate: '2026-10-20', status: 'Approved', itemCount: 2, total: 441,
        lines: [
          { id: 'PO-LINE-RICE', itemId: rice.id, itemName: rice.name, sku: rice.sku, unit: rice.unit, quantity: 2, unitCost: 100, discountPercent: 10, gstRate: 5 },
          { id: 'PO-LINE-OIL', itemId: oil.id, itemName: oil.name, sku: oil.sku, unit: oil.unit, quantity: 3, unitCost: 80, discountPercent: 0, gstRate: 5 },
        ],
      }]);
      const purchasePage = await contextFor(true, { width: 1440, height: 1000 });
      await purchasePage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await purchasePage.getByRole('navigation').getByRole('button', { name: 'Purchase entry', exact: true }).click();
      await purchasePage.getByRole('heading', { name: 'Inventory - Purchase entry', exact: true }).waitFor();
      await purchasePage.getByRole('button', { name: 'Add purchase entry', exact: true }).first().click();
      const purchaseDialog = purchasePage.locator('.purchase-entry-modal');
      const purchaseOrderSelect = purchaseDialog.getByRole('combobox', { name: 'Purchase order', exact: true });
      await purchaseDialog.locator('.purchase-line-card').nth(1).waitFor();
      assert.equal(await purchaseOrderSelect.inputValue(), 'PO-LINK', 'the only available approved PO is linked automatically');
      assert.equal(await purchaseDialog.locator('.purchase-meta-grid select').nth(1).inputValue(), 'QA Supplier');
      assert.equal(await purchaseDialog.locator('.purchase-line-card').count(), 2, 'all purchase order products are loaded');
      assert.equal(await purchaseDialog.getByRole('combobox', { name: 'Inventory item 1', exact: true }).inputValue(), 'Basmati rice');
      assert.equal(await purchaseDialog.getByRole('combobox', { name: 'Inventory item 2', exact: true }).inputValue(), 'Cooking oil');
      assert.equal(await purchaseDialog.getByLabel('Quantity').nth(0).inputValue(), '2');
      assert.equal(await purchaseDialog.getByLabel('Quantity').nth(1).inputValue(), '3');
      assert.match(await purchaseDialog.getByPlaceholder('Optional delivery note').inputValue(), /From PO-20261017-777/);
      await capture(purchasePage, 'purchase-entry-linked-order-products');
      await purchasePage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Purchase Entry automatically links the only open PO and loads every ordered product line.');
      if (process.env.ONLY_PURCHASE_ORDER_LINK === '1') {
        assert.deepEqual(errors, [], 'purchase order link browser errors');
        return;
      }
    }
    if (process.env.CHECK_QZ_SETUP === '1') {
      const qzPage = await contextFor(true, { width: 1440, height: 1000 });
      await qzPage.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
      await qzPage.getByRole('button', { name: /QZ Tray setup.*Install, secure, connect/i }).click();
      const setup = qzPage.getByRole('region', { name: 'QZ Tray setup', exact: true });
      await setup.getByRole('heading', { name: 'QZ Tray setup', exact: true }).waitFor();
      assert.match(await setup.innerText(), /Complete these steps once on every POS computer.*Create the trusted signing files.*Select certificate \+ private key.*Check connection.*Billing printer.*KOT printer/is);
      assert.equal(await setup.getByRole('link', { name: /Download QZ Tray/i }).first().getAttribute('href'), 'https://qz.io/download/');
      await setup.getByRole('tab', { name: 'macOS', exact: true }).click();
      assert.match(await setup.innerText(), /Apple Silicon or Intel/i);
      await capture(qzPage, 'qz-setup-desktop');
      await qzPage.setViewportSize({ width: 390, height: 844 });
      if (await qzPage.locator('.sidebar-mobile-close').isVisible()) await qzPage.locator('.sidebar-mobile-close').click();
      await capture(qzPage, 'qz-setup-mobile');
      await qzPage.context().close();
      console.log('PASS: QZ Tray setup guide, signing instructions, OS tabs, printer routes and responsive layout.');
    }
    if (process.env.CHECK_PAGE_STABILITY === '1') {
      const originalRows = new Map(rows);
      const oldDate = '2025-01-01T00:00:00.000Z';
      put('vestora-purchase-drafts-QA-DESIGN', [{
        id: 'QA-PENDING-STABLE', status: 'PendingApproval', createdAt: oldDate, updatedAt: oldDate,
        entry: { supplier: 'QA Supplier', invoice: 'QA-STAY-PUT', date: '2026-10-16', notes: '', lines: [{ id: 'QA-LINE', itemId: 'QA-RICE', name: 'Basmati rice', sku: 'RICE-001', quantity: '1', unit: 'kg', unitCost: '100', sellingPrice: '150', discountPercent: '0', taxRate: '5', gstRate: '5', category: 'Grains' }] },
      }]);
      put('vestora-inventory-transactions-QA-DESIGN', Array.from({ length: 18 }, (_, index) => ({
        id: `QA-OLD-PUR-${index}`, type: 'Purchase', purchaseId: `PUR-OLD-${index}`, supplier: 'QA Supplier', invoice: `OLD-${index}`, item: 'Basmati rice', itemId: 'QA-RICE', sku: 'RICE-001', quantity: 1, qty: '1 kg', unit: 'kg', unitCost: 100, subtotal: 100, tax: 5, total: 105, date: '2026-10-01', createdAt: `2026-10-01T00:${String(index).padStart(2, '0')}:00.000Z`,
      })));
      const stablePage = await contextFor(true, { width: 1440, height: 760 });
      await stablePage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await stablePage.getByRole('heading', { name: 'Inventory - Purchase entry', exact: true }).waitFor();
      const pendingRow = stablePage.getByRole('row').filter({ hasText: 'QA-STAY-PUT' });
      await pendingRow.getByRole('button', { name: 'Actions for QA-STAY-PUT', exact: true }).click();
      const beforeTop = await stablePage.evaluate(() => window.scrollY);
      await stablePage.getByRole('menuitem', { name: 'Approve & post', exact: true }).click();
      await stablePage.locator('.toast').filter({ hasText: 'approved' }).waitFor();
      await stablePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await stablePage.getByRole('heading', { name: 'Inventory - Purchase entry', exact: true }).isVisible(), 'approval keeps the Purchase entry page active');
      assert.equal(await stablePage.getByRole('heading', { name: 'Purchase - Vendor settlements', exact: true }).count(), 0, 'approval does not open vendor settlements');
      const afterTop = await stablePage.evaluate(() => window.scrollY);
      assert.ok(Math.abs(afterTop - beforeTop) <= 2, `approval preserves viewport position (${beforeTop} -> ${afterTop})`);
      await stablePage.reload();
      await stablePage.waitForFunction(() => window.vestoraCloudStateReady === true);
      await stablePage.waitForTimeout(500);
      const reloadedHeading = await stablePage.locator('.topbar h1').textContent();
      assert.equal(reloadedHeading, 'Inventory - Purchase entry', `automatic reload keeps the same page (found ${reloadedHeading})`);
      await stablePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const reloadedTop = await stablePage.evaluate(() => window.scrollY);
      assert.ok(Math.abs(reloadedTop - afterTop) <= 2, `automatic reload restores the same page position (${afterTop} -> ${reloadedTop})`);
      await stablePage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Purchase approval and automatic reload stay on Purchase entry and preserve the operator viewport.');
    }
    if (process.env.CHECK_INVOICE_ADJUSTMENTS === '1') {
      const originalRows = new Map(rows);
      const purchase = await contextFor(true, { width: 1440, height: 1000 });
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await purchase.locator('.purchase-meta-grid select').selectOption('QA Supplier');
      await purchase.getByPlaceholder('e.g. INV-1042').fill('QA-BILL-CHARGES');
      const picker = purchase.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await picker.fill('rice');
      await purchase.getByRole('option', { name: /Basmati rice/ }).click();
      const line = purchase.locator('.purchase-line-card').first();
      await line.getByLabel('Quantity', { exact: true }).fill('2');
      await line.getByLabel('Discount %', { exact: true }).fill('10');
      const discount = purchase.getByRole('spinbutton', { name: 'Bill discount', exact: true });
      const discountType = purchase.getByRole('combobox', { name: 'Bill discount type', exact: true });
      const freight = purchase.getByLabel('Freight / delivery charge (₹)', { exact: true });
      const other = purchase.getByLabel('Other charges (₹)', { exact: true });
      const invoiceTotal = async () => Number((await purchase.locator('.purchase-totals .grand-total strong').innerText()).replace(/[^\d.]/g, ''));
      await discount.fill('16');
      await freight.fill('50');
      await purchase.getByRole('combobox', { name: 'Freight GST %', exact: true }).selectOption('18');
      await other.fill('20');
      await purchase.getByRole('combobox', { name: 'Other charges GST %', exact: true }).selectOption('5');
      assert.equal(await invoiceTotal(), 290);
      await discountType.selectOption('percent');
      await discount.fill('10');
      assert.equal(await invoiceTotal(), 284.12, 'bill discount follows line discount and precedes GST');
      const rounding = purchase.getByRole('combobox', { name: 'Round off', exact: true });
      const roundAmount = purchase.getByRole('spinbutton', { name: 'Round-off adjustment (₹)', exact: true });
      await rounding.selectOption('nearest');
      assert.equal(await invoiceTotal(), 284);
      assert.equal(await roundAmount.inputValue(), '-0.12');
      await discount.fill('9');
      assert.equal(await invoiceTotal(), 286, 'automatic rounding follows bill changes');
      assert.equal(await roundAmount.inputValue(), '-0.39');
      await discountType.selectOption('amount');
      await discount.fill('16');
      await rounding.selectOption('manual');
      await roundAmount.fill('-0.25');
      assert.equal(await invoiceTotal(), 289.75);
      await roundAmount.fill('0.25');
      assert.equal(await invoiceTotal(), 290.25);
      const inventoryBefore = JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value);
      const draftsKey = 'vestora-purchase-drafts-QA-DESIGN';
      const waitState = key => purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === key && response.status() === 200);
      let saving = waitState(draftsKey);
      await purchase.getByRole('button', { name: 'Save draft', exact: true }).click();
      await saving;
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value), inventoryBefore);
      await capture(purchase, 'purchase-bill-charges');
      await purchase.reload();
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await purchase.getByRole('region', { name: 'Saved purchase drafts', exact: true }).getByRole('button', { name: 'Edit draft', exact: true }).click();
      assert.equal(await discount.inputValue(), '16');
      assert.equal(await freight.inputValue(), '50');
      assert.equal(await other.inputValue(), '20');
      assert.equal(await rounding.inputValue(), 'manual');
      assert.equal(await roundAmount.inputValue(), '0.25');
      assert.equal(await invoiceTotal(), 290.25);
      await discount.fill('500');
      await purchase.getByRole('alert').filter({ hasText: 'Bill discount cannot exceed' }).waitFor();
      saving = waitState(draftsKey);
      await purchase.getByRole('button', { name: 'Update draft', exact: true }).click();
      await saving;
      await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).click();
      assert.equal(rows.get(draftsKey).state_value[0].status, 'Draft', 'invalid discount cannot post');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value), inventoryBefore);
      await discount.fill('16');
      saving = waitState(draftsKey);
      await purchase.getByRole('button', { name: 'Update draft', exact: true }).click();
      await saving;
      await purchase.setViewportSize({ width: 390, height: 844 });
      if (await purchase.locator('.sidebar-mobile-close').isVisible()) await purchase.locator('.sidebar-mobile-close').click();
      await capture(purchase, 'purchase-bill-charges-mobile');
      const savedInventory = waitState('vestora-inventory-QA-DESIGN');
      const savedLedger = waitState('vestora-inventory-transactions-QA-DESIGN');
      await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).click();
      await Promise.all([savedInventory, savedLedger]);
      const receipt = rows.get('vestora-inventory-transactions-QA-DESIGN').state_value.find(entry => entry.invoice === 'QA-BILL-CHARGES');
      assert.equal(receipt.total, 290.25);
      assert.equal(receipt.roundOff, 0.25);
      assert.equal(receipt.billDiscount, 16);
      assert.equal(receipt.freightCharge, 50);
      assert.equal(receipt.freightTax, 9);
      assert.equal(receipt.otherCharges, 20);
      assert.equal(receipt.tax, 20);
      assert.equal(receipt.invoiceSummary.total, 290.25);
      assert.equal(receipt.invoiceSummary.beforeRoundOff, 290);
      assert.equal(receipt.invoiceSummary.roundOff, 0.25);
      const stock = rows.get('vestora-inventory-QA-DESIGN').state_value.find(item => item.id === 'QA-RICE');
      assert.equal(stock.stock, 44);
      assert.equal(stock.cost, 126.8636, 'landed stock cost includes invoice discount and charges');
      await purchase.setViewportSize({ width: 1440, height: 1000 });
      if (await purchase.locator('.app.sidebar-collapsed').count()) await purchase.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
      await purchase.getByRole('navigation').getByRole('button', { name: 'Vendor settlements', exact: true }).click();
      const invoiceRow = purchase.getByRole('region', { name: 'Invoice balances table', exact: true }).locator('tbody tr').filter({ hasText: 'QA-BILL-CHARGES' });
      assert.match(await invoiceRow.innerText(), /290\.25/);
      await purchase.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: bill discount, freight/other GST, automatic/manual round off, draft reload, invalid guard, unchanged stock cost and rounded vendor balance.');
    }
    if (process.env.CHECK_VENDOR_SETTLEMENTS === '1') {
      const originalRows = new Map(rows);
      const inventoryBefore = JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value);
      const purchases = [
        { id: 'TRN-1', type: 'Purchase', purchaseId: 'PUR-1', supplier: 'QA Supplier', invoice: 'INV-1', total: 1000, quantity: 1, date: '2026-10-15' },
        { id: 'TRN-2', type: 'Purchase', purchaseId: 'PUR-2', supplier: 'QA Supplier', invoice: 'INV-2', total: 500, quantity: 1, date: '2026-10-14' },
        { id: 'TRN-3', type: 'Purchase', purchaseId: 'PUR-3', supplier: 'Other Vendor', invoice: 'INV-3', total: 200, quantity: 1, date: '2026-10-13' },
      ];
      const payments = [
        { id: 'PAY-1', purchaseId: 'PUR-1', vendor: 'QA Supplier', invoice: 'INV-1', amount: 300, method: 'UPI', reference: 'REF-300', note: 'First instalment', status: 'Paid', date: '2026-10-15' },
        { id: 'PAY-2', vendor: 'QA Supplier', invoice: 'INV-2', amount: 500, method: 'Bank', reference: 'BANK-500', note: 'Fully paid', status: 'Paid', date: '2026-10-14' },
        { id: 'PAY-3', purchaseId: 'PUR-1', vendor: 'QA Supplier', invoice: 'INV-1', amount: 200, method: 'Cash', reference: 'REV-200', note: 'Reversed payment', status: 'Reversed', date: '2026-10-13' },
      ];
      put('vestora-inventory-transactions-QA-DESIGN', purchases);
      put('vestora-finance-vendor-payments-QA-DESIGN', payments);
      const settlementPage = await contextFor(true, { width: 1440, height: 1000 });
      await settlementPage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const sidebarLink = settlementPage.getByRole('navigation').getByRole('button', { name: 'Vendor settlements', exact: true });
      await sidebarLink.click();
      await settlementPage.getByRole('heading', { name: 'Vendor settlements', exact: true }).waitFor();
      assert.match(await sidebarLink.getAttribute('class'), /active/);
      assert.equal(await settlementPage.getByRole('heading', { level: 1 }).innerText(), 'Purchase - Vendor settlements');
      const summaryValues = await settlementPage.locator('.vendor-settlement-summary strong').allTextContents();
      assert.deepEqual(summaryValues.map(value => Number(value.replace(/[^\d.]/g, ''))), [3, 1700, 800, 900]);
      const invoiceRows = settlementPage.getByRole('region', { name: 'Invoice balances table', exact: true }).locator('tbody tr');
      const paymentRows = settlementPage.getByRole('region', { name: 'Payment history table', exact: true }).locator('tbody tr');
      assert.equal(await invoiceRows.count(), 3);
      assert.equal(await paymentRows.count(), 3);
      await capture(settlementPage, 'vendor-settlements-desktop');
      await settlementPage.getByLabel('Invoice status', { exact: true }).selectOption('Outstanding');
      assert.equal(await invoiceRows.count(), 2);
      await settlementPage.getByLabel('Invoice status', { exact: true }).selectOption('Paid');
      assert.equal(await invoiceRows.count(), 1);
      assert.match(await invoiceRows.first().innerText(), /INV-2/);
      await settlementPage.getByLabel('Invoice status', { exact: true }).selectOption('All invoices');
      await invoiceRows.filter({ hasText: 'INV-1' }).getByRole('button', { name: 'View payments', exact: true }).click();
      assert.equal(await paymentRows.count(), 2, 'invoice details include its reversed payment without counting it as paid');
      assert.match(await paymentRows.first().innerText(), /First instalment/);
      await settlementPage.getByRole('button', { name: 'Show all payments', exact: true }).click();
      const search = settlementPage.getByRole('searchbox', { name: 'Search settlements', exact: true });
      await search.fill('REF-300');
      assert.equal(await paymentRows.count(), 1);
      assert.match(await paymentRows.first().innerText(), /UPI/);
      await search.fill('');
      await settlementPage.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await capture(settlementPage, 'vendor-settlements-dark');
      await settlementPage.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await settlementPage.setViewportSize({ width: 390, height: 844 });
      if (await settlementPage.locator('.sidebar-mobile-close').isVisible()) await settlementPage.locator('.sidebar-mobile-close').click();
      await capture(settlementPage, 'vendor-settlements-mobile');
      assert.equal(JSON.stringify(rows.get('vestora-finance-vendor-payments-QA-DESIGN').state_value), JSON.stringify(payments), 'viewing details never edits payments');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value), inventoryBefore);
      await settlementPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Purchase sidebar settlement view, totals, balances, legacy links, reversed payment history, filters, dark mode and mobile.');
    }
    if (process.env.CHECK_PURCHASE_DRAFTS === '1') {
      const originalRows = new Map(rows);
      const purchase = await contextFor(true, { width: 1440, height: 1000 });
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const draftKey = 'vestora-purchase-drafts-QA-DESIGN';
      const inventoryBefore = JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value);
      const transactionsBefore = JSON.stringify(rows.get('vestora-inventory-transactions-QA-DESIGN')?.state_value);
      const waitSave = () => purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === draftKey && response.status() === 200);
      const initialSave = waitSave();
      await purchase.getByRole('button', { name: 'Save draft', exact: true }).click();
      await initialSave;
      assert.equal(rows.get(draftKey).state_value.length, 1, 'incomplete entries can be saved');
      const draftId = rows.get(draftKey).state_value[0].id;
      assert.equal(rows.get(draftKey).state_value[0].status, 'Draft');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value), inventoryBefore);
      assert.equal(JSON.stringify(rows.get('vestora-inventory-transactions-QA-DESIGN')?.state_value), transactionsBefore);
      await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).click();
      assert.equal(rows.get(draftKey).state_value[0].status, 'Draft', 'incomplete drafts cannot submit');
      await purchase.reload();
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const savedList = purchase.getByRole('region', { name: 'Saved purchase drafts', exact: true });
      await savedList.getByRole('button', { name: 'Edit draft', exact: true }).click();
      await purchase.locator('.purchase-meta-grid select').selectOption('QA Supplier');
      await purchase.getByPlaceholder('e.g. INV-1042').fill('QA-DRAFT-RELOAD');
      const picker = purchase.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await picker.fill('rice');
      await purchase.getByRole('option', { name: /Basmati rice/ }).click();
      const line = purchase.locator('.purchase-line-card').first();
      await line.getByLabel('Quantity', { exact: true }).fill('2');
      await line.getByLabel('Discount %', { exact: true }).fill('10');
      await line.getByRole('combobox', { name: 'GST %', exact: true }).selectOption('18');
      await line.getByPlaceholder('Selling price').fill('180');
      assert.ok(await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).isDisabled());
      let saving = waitSave();
      await purchase.getByRole('button', { name: 'Update draft', exact: true }).click();
      await saving;
      await line.getByLabel('Quantity', { exact: true }).fill('3');
      assert.ok(await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).isDisabled(), 'unsaved edits cannot submit');
      saving = waitSave();
      await purchase.getByRole('button', { name: 'Update draft', exact: true }).click();
      await saving;
      await capture(purchase, 'purchase-saved-draft');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN').state_value), inventoryBefore, 'draft updates do not change stock or prices');
      await purchase.reload();
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await savedList.getByRole('button', { name: 'Edit draft', exact: true }).click();
      assert.equal(await purchase.getByPlaceholder('e.g. INV-1042').inputValue(), 'QA-DRAFT-RELOAD');
      assert.equal(await line.getByLabel('Quantity', { exact: true }).inputValue(), '3');
      assert.equal(await line.getByLabel('Discount %', { exact: true }).inputValue(), '10');
      assert.equal(await line.getByRole('combobox', { name: 'GST %', exact: true }).inputValue(), '18');
      assert.equal(await line.getByPlaceholder('Selling price').inputValue(), '180');
      await purchase.setViewportSize({ width: 390, height: 844 });
      if (await purchase.locator('.sidebar-mobile-close').isVisible()) await purchase.locator('.sidebar-mobile-close').click();
      await capture(purchase, 'purchase-draft-mobile');
      const posted = waitSave();
      const savedInventory = purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-inventory-QA-DESIGN' && response.status() === 200);
      const savedLedger = purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-inventory-transactions-QA-DESIGN' && response.status() === 200);
      await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).evaluate(button => { button.click(); button.click(); });
      await Promise.all([posted, savedInventory, savedLedger]);
      const savedRice = rows.get('vestora-inventory-QA-DESIGN').state_value.find(item => item.id === 'QA-RICE');
      assert.equal(savedRice.stock, JSON.parse(inventoryBefore)[0].stock + 3, 'stock is received exactly once');
      assert.equal(savedRice.sellingPrice, 180);
      const receipts = rows.get('vestora-inventory-transactions-QA-DESIGN').state_value.filter(entry => entry.sourceDraftId === draftId);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].total, 382.32);
      assert.equal(rows.get(draftKey).state_value[0].status, 'Submitted');
      assert.equal(await savedList.getByRole('button', { name: 'Edit draft', exact: true }).count(), 0);
      await purchase.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: incomplete draft save, reload/edit, dirty-submit guard, mobile, stock unchanged until submit and double-submit protection.');
    }
    if (process.env.CHECK_VENDOR_POPUP === '1') {
      const purchase = await contextFor(true, { width: 1440, height: 1000 });
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const invoice = purchase.getByPlaceholder('e.g. INV-1042');
      await invoice.fill('QA-KEEP-DRAFT');
      const picker = purchase.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await picker.fill('rice');
      await purchase.getByRole('option', { name: /Basmati rice/ }).click();
      const quantity = purchase.locator('.purchase-line-card').first().getByLabel('Quantity', { exact: true });
      await quantity.fill('2');
      const inventoryBefore = JSON.stringify(rows.get('vestora-inventory-QA-DESIGN'));
      const transactionsBefore = JSON.stringify(rows.get('vestora-inventory-transactions-QA-DESIGN'));
      const trigger = purchase.locator('.purchase-editor .inventory-add-category');
      const dialog = purchase.getByRole('dialog', { name: 'Add vendor', exact: true });
      const vendorName = dialog.getByRole('textbox', { name: 'Vendor name', exact: true });
      await trigger.click();
      await dialog.waitFor();
      assert.ok(await dialog.evaluate(element => element.matches(':modal')), 'vendor form is a modal popup');
      assert.ok(await vendorName.evaluate(element => element === document.activeElement), 'name receives initial focus');
      await dialog.getByRole('button', { name: 'Close vendor form', exact: true }).focus();
      await purchase.keyboard.press('Shift+Tab');
      assert.ok(await dialog.getByRole('button', { name: 'Save vendor', exact: true }).evaluate(element => element === document.activeElement), 'Tab focus stays inside the popup');
      await vendorName.fill('Unsaved vendor');
      await purchase.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.ok(await trigger.evaluate(element => element === document.activeElement), 'focus returns to New vendor');
      assert.equal(await invoice.inputValue(), 'QA-KEEP-DRAFT');
      assert.equal(await quantity.inputValue(), '2');
      await trigger.click();
      assert.equal(await vendorName.inputValue(), '', 'cancelled vendor details are reset');
      await vendorName.fill('QA Popup Supplier');
      await dialog.getByRole('textbox', { name: 'Phone', exact: true }).fill('9876543210');
      await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('supplier@example.test');
      await dialog.getByRole('textbox', { name: 'Address', exact: true }).fill('QA supplier address');
      await capture(purchase, 'purchase-vendor-popup');
      const savedVendor = purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/')
        && response.request().method() === 'PUT' && response.request().postDataJSON()?.key === 'vestora-inventory-vendors-QA-DESIGN' && response.status() === 200);
      await dialog.getByRole('button', { name: 'Save vendor', exact: true }).click();
      await savedVendor;
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await purchase.locator('.purchase-meta-grid select').inputValue(), 'QA Popup Supplier');
      assert.equal(await invoice.inputValue(), 'QA-KEEP-DRAFT');
      assert.equal(await picker.inputValue(), 'Basmati rice');
      assert.equal(await quantity.inputValue(), '2');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-QA-DESIGN')), inventoryBefore, 'saving a vendor does not post stock');
      assert.equal(JSON.stringify(rows.get('vestora-inventory-transactions-QA-DESIGN')), transactionsBefore, 'saving a vendor does not post the purchase');
      assert.equal(rows.get('vestora-inventory-vendors-QA-DESIGN').state_value.find(vendor => vendor.name === 'QA Popup Supplier').email, 'supplier@example.test');
      await trigger.click();
      await dialog.getByRole('button', { name: 'Close vendor form', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await purchase.setViewportSize({ width: 390, height: 844 });
      if (await purchase.locator('.sidebar-mobile-close').isVisible()) await purchase.locator('.sidebar-mobile-close').click();
      await trigger.click();
      await capture(purchase, 'purchase-vendor-popup-mobile');
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844, 'popup fits the mobile viewport');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await purchase.locator('.purchase-meta-grid select').inputValue(), 'QA Popup Supplier');
      await purchase.context().close();
      console.log('PASS: vendor popup, focus containment, Escape/Cancel/Close, mobile, vendor saving and intact purchase draft.');
    }
    if (process.env.CHECK_PURCHASE_PRICE === '1') {
      const pricePage = await contextFor(true, { width: 1440, height: 1000 });
      await pricePage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await pricePage.locator('.purchase-meta-grid select').selectOption('QA Supplier');
      await pricePage.getByPlaceholder('e.g. INV-1042').fill('QA-SELLING-PRICE');
      const itemPicker = pricePage.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await itemPicker.fill('rice');
      await pricePage.getByRole('option', { name: /Basmati rice/ }).click();
      const line = pricePage.locator('.purchase-line-card').first();
      const sellingPrice = line.getByPlaceholder('Selling price');
      assert.equal(await sellingPrice.inputValue(), '150');
      await sellingPrice.fill('175');
      await line.getByLabel('Quantity', { exact: true }).fill('2');
      const gst = line.getByRole('combobox', { name: 'GST %', exact: true });
      assert.equal(await gst.inputValue(), '5', 'GST defaults to the selected product rate');
      assert.deepEqual(await gst.locator('option:not([disabled])').allTextContents(), ['0%', '0.25%', '1.5%', '3%', '5%', '18%', '40%']);
      await line.getByLabel(/Rate \/ unit/).fill('100');
      await gst.selectOption('18');
      assert.equal(Number((await pricePage.locator('.purchase-totals .grand-total strong').innerText()).replace(/[^\d.]/g, '')), 236);
      await gst.selectOption('0');
      assert.equal(Number((await pricePage.locator('.purchase-totals .grand-total strong').innerText()).replace(/[^\d.]/g, '')), 200);
      await gst.selectOption('5');
      await gst.press('ArrowUp');
      assert.equal(await gst.inputValue(), '3', 'Up changes the native GST selection');
      await gst.press('ArrowDown');
      assert.equal(await gst.inputValue(), '5', 'Down changes the native GST selection');
      await line.getByLabel(/Rate \/ unit/).fill('120');
      await capture(pricePage, 'purchase-gst-dropdown');
      assert.equal(Number((await pricePage.locator('.purchase-totals .grand-total strong').innerText()).replace(/[^\d.]/g, '')), 252);
      await capture(pricePage, 'purchase-selling-price');
      const savedInventory = pricePage.waitForResponse(response => response.url().endsWith('/api/cloud/state/')
        && response.request().method() === 'PUT' && response.request().postDataJSON()?.key === 'vestora-inventory-QA-DESIGN' && response.status() === 200);
      await pricePage.getByRole('button', { name: 'Save draft', exact: true }).click();
      await pricePage.getByRole('button', { name: 'Submit purchase', exact: true }).click();
      await savedInventory;
      const saved = rows.get('vestora-inventory-QA-DESIGN').state_value.find(item => item.id === 'QA-RICE');
      assert.equal(saved.sellingPrice, 175);
      assert.equal(saved.stock, 44);
      assert.equal(saved.cost, 126);
      await pricePage.context().close();
      console.log('PASS: Purchase Entry loads and saves selling price, while purchase totals and cost remain unchanged.');
    }
    if (process.env.CHECK_PURCHASE_BATCHES === '1') {
      const originalRows = new Map(rows);
      const rice = rows.get('vestora-inventory-QA-DESIGN').state_value[0];
      const tea = { ...rice, id: 'QA-TEA', name: 'Tea', sku: 'TEA', barcode: 'TEA-EAN', stock: 0 };
      put('vestora-inventory-QA-DESIGN', [
        { ...rice, mrp: 200, eanMrpOptions: [{ barcode: 'SECOND-EAN', mrp: 220 }] }, tea,
        { ...tea, id: 'QA-TEA-1', parentProductId: tea.id, variantLabel: 'Batch 1', stock: 4, sku: 'TEA-1' },
        { ...tea, id: 'QA-TEA-2', parentProductId: tea.id, variantLabel: 'Batch 2', stock: 9, sku: 'TEA-2' },
      ]);
      const purchase = await contextFor(true, { width: 1440, height: 1000 });
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await purchase.locator('.purchase-meta-grid select').selectOption('QA Supplier');
      await purchase.getByPlaceholder('e.g. INV-1042').fill('QA-BATCHES');
      const picker = purchase.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await picker.fill('rice');
      assert.equal(await purchase.getByRole('option', { name: /Basmati rice - Batch/ }).count(), 2);
      await capture(purchase, 'purchase-batch-choices');
      assert.ok(await purchase.getByRole('option', { name: /Basmati rice - Batch 2/ }).evaluate(option => {
        const rect = option.getBoundingClientRect();
        return option.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 4));
      }), 'the second batch is not clipped by the purchase form');
      await picker.press('ArrowDown');
      await picker.press('ArrowDown');
      await picker.press('Enter');
      assert.equal(await picker.inputValue(), 'Basmati rice - Batch 2');
      assert.match(await purchase.locator('.purchase-item-picker').first().innerText(), /SECOND-EAN/);
      await purchase.locator('.purchase-line-card').first().getByLabel('Quantity', { exact: true }).fill('2');
      await purchase.getByRole('button', { name: 'Add line', exact: true }).click();
      const secondPicker = purchase.getByRole('combobox', { name: 'Inventory item 2', exact: true });
      await secondPicker.fill('890987654321');
      assert.equal(await purchase.getByRole('option', { name: /Basmati rice - Batch/ }).count(), 1);
      await purchase.getByRole('option', { name: /Basmati rice - Batch 1/ }).click();
      assert.equal(await picker.inputValue(), 'Basmati rice - Batch 2', 'same product batches stay independently selected');
      await purchase.locator('.purchase-line-card').nth(1).getByLabel('Quantity', { exact: true }).fill('3');
      await purchase.getByRole('button', { name: 'Add line', exact: true }).click();
      const thirdPicker = purchase.getByRole('combobox', { name: 'Inventory item 3', exact: true });
      await thirdPicker.fill('tea batch 2');
      await purchase.getByRole('option', { name: /Tea - Batch 2/ }).click();
      await purchase.locator('.purchase-line-card').nth(2).getByLabel('Quantity', { exact: true }).fill('2');
      await purchase.setViewportSize({ width: 390, height: 844 });
      if (await purchase.locator('.sidebar-mobile-close').isVisible()) await purchase.locator('.sidebar-mobile-close').click();
      await secondPicker.fill('rice');
      await capture(purchase, 'purchase-batch-mobile');
      await purchase.getByRole('option', { name: /Basmati rice - Batch 1/ }).click();
      const savedInventory = purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/')
        && response.request().method() === 'PUT' && response.request().postDataJSON()?.key === 'vestora-inventory-QA-DESIGN' && response.status() === 200);
      const savedTransactions = purchase.waitForResponse(response => response.url().endsWith('/api/cloud/state/')
        && response.request().method() === 'PUT' && response.request().postDataJSON()?.key === 'vestora-inventory-transactions-QA-DESIGN' && response.status() === 200);
      await purchase.getByRole('button', { name: 'Save draft', exact: true }).click();
      await purchase.getByRole('button', { name: 'Submit purchase', exact: true }).click();
      await Promise.all([savedInventory, savedTransactions]);
      const saved = rows.get('vestora-inventory-QA-DESIGN').state_value;
      assert.equal(saved.find(item => item.id === 'QA-RICE').stock, rice.stock + 5);
      assert.equal(saved.find(item => item.id === 'QA-TEA').stock, 0);
      assert.equal(saved.find(item => item.id === 'QA-TEA-1').stock, 4);
      assert.equal(saved.find(item => item.id === 'QA-TEA-2').stock, 11);
      const receipts = rows.get('vestora-inventory-transactions-QA-DESIGN').state_value.filter(entry => entry.invoice === 'QA-BATCHES');
      const secondBatch = receipts.find(entry => entry.itemId === 'QA-RICE' && entry.batchLabel === 'Batch 2');
      assert.equal(secondBatch.barcode, 'SECOND-EAN');
      assert.equal(secondBatch.mrp, 220);
      assert.equal(secondBatch.quantity, 2);
      assert.equal(receipts.filter(entry => entry.itemId === 'QA-RICE').length, 2);
      await purchase.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: both EAN/MRP batches, keyboard selection, separate lines, mobile, receipt metadata and stock-batch isolation.');
    }
    if (process.env.CHECK_PURCHASE_PICKER === '1') {
      const purchase = await contextFor(true, { width: 1440, height: 1000 });
      await purchase.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      const picker = purchase.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await picker.click();
      assert.equal(await purchase.getByRole('listbox', { name: 'Matching inventory items' }).count(), 0);
      await picker.fill('basm');
      const rice = purchase.getByRole('option', { name: /Basmati rice/ });
      await rice.waitFor();
      await capture(purchase, 'purchase-item-suggestions');
      await picker.press('ArrowDown');
      await picker.press('Enter');
      assert.equal(await picker.inputValue(), 'Basmati rice');
      const firstLine = purchase.locator('.purchase-line-card').first();
      assert.equal(await firstLine.getByLabel('Unit', { exact: true }).inputValue(), 'kg');
      assert.equal(await firstLine.getByLabel(/Rate \/ unit/).inputValue(), '120');
      for (const query of ['RICE-001', '890987654321']) {
        await picker.fill(query);
        await rice.click();
        assert.equal(await picker.inputValue(), 'Basmati rice');
      }
      await picker.fill('not-found');
      await purchase.getByRole('status').filter({ hasText: 'No matching items' }).waitFor();
      assert.equal(await firstLine.getByLabel(/Rate \/ unit/).inputValue(), '', 'typing clears the old item selection');
      await picker.press('Escape');
      assert.equal(await purchase.getByRole('listbox').count(), 0);
      await picker.fill('new product');
      await purchase.getByRole('option', { name: /Create new inventory item/ }).click();
      await firstLine.getByLabel('New item name', { exact: true }).waitFor();
      await firstLine.getByRole('combobox', { name: 'GST %', exact: true }).selectOption('18');
      await purchase.getByRole('button', { name: 'Add line', exact: true }).click();
      const secondPicker = purchase.getByRole('combobox', { name: 'Inventory item 2', exact: true });
      await secondPicker.fill('rice');
      await rice.click();
      assert.equal(await picker.inputValue(), 'Create new inventory item', 'lines keep independent selections');
      assert.equal(await firstLine.getByRole('combobox', { name: 'GST %', exact: true }).inputValue(), '18');
      assert.equal(await purchase.locator('.purchase-line-card').nth(1).getByRole('combobox', { name: 'GST %', exact: true }).inputValue(), '5');
      const firstQuantity = firstLine.getByLabel('Quantity', { exact: true });
      const secondLine = purchase.locator('.purchase-line-card').nth(1);
      const secondQuantity = secondLine.getByLabel('Quantity', { exact: true });
      const secondRate = secondLine.getByLabel(/Rate \/ unit/);
      const focused = (locator) => locator.evaluate((element) => element === document.activeElement);
      await firstQuantity.fill('2');
      await secondQuantity.fill('3');
      await secondQuantity.press('ArrowRight');
      assert.ok(await focused(secondRate), 'Right moves to rate, skipping disabled Unit');
      await secondRate.press('ArrowLeft');
      assert.ok(await focused(secondQuantity), 'Left moves to quantity');
      await secondQuantity.press('ArrowUp');
      assert.ok(await focused(firstQuantity), 'Up moves to the same field on the previous line');
      await firstQuantity.press('ArrowDown');
      assert.ok(await focused(secondQuantity), 'Down moves to the same field on the next line');
      await secondQuantity.press('ArrowDown');
      assert.equal(await secondQuantity.inputValue(), '3', 'Down at the last line does not change quantity');
      assert.equal(await firstQuantity.inputValue(), '2', 'navigation preserves quantity');
      assert.equal(await secondRate.inputValue(), '120', 'navigation preserves price');
      const invoice = purchase.getByPlaceholder('e.g. INV-1042');
      await invoice.fill('INV-1042');
      await invoice.press('Home');
      await invoice.press('ArrowRight');
      assert.ok(await focused(invoice), 'text arrows move the caret while editing');
      await invoice.press('End');
      await invoice.press('ArrowRight');
      assert.ok(await focused(purchase.getByLabel('Purchase date', { exact: true })), 'Right at the text boundary moves to the next field');
      console.log('PASS: purchase arrow navigation preserves values, skips disabled fields and moves between lines.');
      await purchase.setViewportSize({ width: 390, height: 844 });
      if (await purchase.locator('.sidebar-mobile-close').isVisible()) await purchase.locator('.sidebar-mobile-close').click();
      await secondPicker.fill('rice');
      await rice.waitFor();
      await capture(purchase, 'purchase-item-mobile');
      await purchase.context().close();
      console.log('PASS: purchase typeahead, name/SKU/barcode matching, keyboard selection, new items and independent lines.');
    }
    if (process.env.CHECK_VESTY === '1') {
      const originalRows = new Map(rows);
      put('vestora-inventory-QA-DESIGN', rows.get('vestora-inventory-QA-DESIGN').state_value.map(item => ({ ...item, reorder: 50 })));
      put('vestora-refund-ledger', [{ id: 'QA-REFUND', storeId: 'QA-DESIGN', createdAt: new Date().toISOString(), amount: 20, billId: 'QA-BILL-1' }]);
      put('vestora-inventory-transactions-QA-DESIGN', [{ id: 'QA-PURCHASE-LINE', type: 'Purchase', purchaseId: 'QA-PURCHASE', supplier: 'QA Supplier', total: 500 }]);
      put('vestora-finance-vendor-payments-QA-DESIGN', [{ id: 'QA-VENDOR-PAYMENT', vendor: 'QA Supplier', amount: 125 }]);
      put('vestora-finance-expenses-QA-DESIGN', [{ id: 'QA-EXPENSE', date: new Date().toISOString().slice(0, 10), amount: 1000, status: 'Posted', category: 'Rent' }]);
      put('vestora-recipes-QA-DESIGN', [{ id: 'QA-RECIPE', name: 'Garden grain bowl', outputQty: 1, ingredients: [{ name: 'Basmati rice', qty: 100, unit: 'g' }] }]);
      put('vestora-purchase-drafts-QA-DESIGN', [{ id: 'QA-DRAFT', status: 'Draft', entry: { lines: [] } }, { id: 'QA-PENDING', status: 'PendingApproval', entry: { lines: [] } }]);
      put('vestora-table-orders', [{ id: 'QA-TABLE-ORDER', storeId: 'QA-DESIGN', status: 'Ready for billing', tableName: 'T1' }]);
      put('vestora-kds-orders', [{ id: 'QA-KDS', storeId: 'QA-DESIGN', status: 'Preparing', items: ['1 bowl'] }]);
      const vestyPage = await contextFor(true, { width: 1440, height: 1000 });
      const launcher = vestyPage.getByRole('button', { name: 'Open Vesty assistant', exact: true });
      await launcher.click();
      const vesty = vestyPage.getByRole('dialog', { name: 'Vesty assistant', exact: true });
      await vesty.waitFor();
      assert.match(await vesty.innerText(), /Vesty.*Live branch data.*The Green Table.*Indiranagar/is);
      const input = vesty.getByRole('textbox', { name: 'Ask Vesty', exact: true });
      const ask = async (question, expected) => {
        await input.fill(question);
        await input.press('Enter');
        await vesty.locator('.vesty-message.assistant').last().waitFor();
        assert.match(await vesty.locator('.vesty-message.assistant').last().innerText(), expected);
      };
      await ask('What are sales today?', /gross sales.*₹21,120.*24 bills.*net sales.*₹21,100/is);
      await ask('Give me this month profit and loss', /Profit & loss for this month.*Net sales \(excluding GST\): ₹21,100.*Food cost \(recipe COGS\): ₹604\.80.*Operating expenses: ₹1,000.*Net profit: ₹19,495\.20/is);
      await ask('Top selling item this week', /Garden grain bowl.*48 sold/is);
      await ask('Which items are low stock?', /Basmati rice.*42 kg/is);
      await ask('Vendor outstanding balance', /₹375/);
      await ask('Active table orders and KDS', /1 active.*1 ready.*1 order.*not completed/is);
      await ask('How does purchase work?', /Purchase supports vendor creation.*draft and approval.*round-off/is);
      await vestyPage.getByRole('button', { name: 'Clear Vesty conversation', exact: true }).click();
      assert.equal(await vesty.locator('.vesty-message').count(), 1);
      await capture(vestyPage, 'vesty-desktop');
      await vestyPage.getByRole('button', { name: 'Expand Vesty', exact: true }).click();
      assert.ok((await vesty.boundingBox()).width > 600);
      await vestyPage.getByRole('button', { name: 'Restore Vesty size', exact: true }).click();
      await vestyPage.keyboard.press('Escape');
      await vesty.waitFor({ state: 'hidden' });
      await vestyPage.setViewportSize({ width: 390, height: 844 });
      await vestyPage.getByRole('button', { name: 'Open Vesty assistant', exact: true }).click();
      await vesty.waitFor();
      const bounds = await vesty.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844, 'Vesty fits mobile viewport');
      await input.fill('Sales today');
      await capture(vestyPage, 'vesty-mobile');
      await vestyPage.getByRole('button', { name: 'Close Vesty', exact: true }).click();
      await vesty.waitFor({ state: 'hidden' });
      await vestyPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: Vesty live sales/refunds, P&L, top items, stock, purchases, tables/KDS, software help, clear/expand/Escape and mobile.');
    }
    if (process.env.CHECK_REPORTS_DESIGN === '1') {
      const originalRows = new Map(rows);
      const reportBills = Array.from({ length: 32 }, (_, index) => {
        const qty = index % 2 + 1;
        const price = 100 + index;
        const subtotal = qty * price;
        return { id: `QA-REPORT-${String(index).padStart(3, '0')}`, storeId: 'QA-DESIGN', createdAt: new Date().toISOString(),
          total: subtotal * 1.05, tax: subtotal * .05, discount: 0, itemCount: qty, orderType: index % 2 ? 'Takeaway' : 'Dine-in', payment: index % 2 ? 'Cash' : 'Card',
          items: [{ id: index % 2 ? 'QA-TEA' : 'QA-BOWL', name: index % 2 ? 'Masala tea' : 'Garden grain bowl', qty, price }] };
      });
      put('vestora-sales-ledger', reportBills);
      const reportPage = await contextFor(true, { width: 1440, height: 1000 });
      await reportPage.getByRole('navigation').getByRole('button', { name: 'Reports', exact: true }).click();
      const workspace = reportPage.getByRole('region', { name: 'Reports workspace', exact: true });
      const reportPicker = workspace.getByRole('combobox', { name: 'Report type', exact: true });
      await reportPicker.selectOption('Item-wise sales');
      const dataRows = workspace.locator('.reports-data-table tbody tr');
      await workspace.getByRole('status').filter({ hasText: '32 records' }).waitFor();
      assert.equal(await dataRows.count(), 25);
      assert.equal(await workspace.locator('.excel-formula-row').count(), 0);
      await workspace.getByRole('button', { name: 'Next page', exact: true }).click();
      assert.equal(await dataRows.count(), 7);
      await workspace.getByRole('button', { name: 'Previous page', exact: true }).click();
      const salesSort = workspace.getByRole('columnheader', { name: 'Sales', exact: true });
      await salesSort.getByRole('button').click();
      await salesSort.getByRole('button').click();
      assert.equal(await salesSort.getAttribute('aria-sort'), 'descending');
      const cellMoney = text => Number(text.replace(/[^\d.-]/g, ''));
      assert.ok(cellMoney(await dataRows.first().locator('td').last().innerText()) >= cellMoney(await dataRows.nth(1).locator('td').last().innerText()));
      await capture(reportPage, 'reports-item-sales-desktop');
      const downloadPromise = reportPage.waitForEvent('download');
      await workspace.getByRole('button', { name: 'CSV', exact: true }).click();
      const download = await downloadPromise;
      const csv = fs.readFileSync(await download.path(), 'utf8');
      assert.equal(csv.split('\n').length, 33, 'CSV exports all filtered rows, not just the current page');
      await reportPage.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await dataRows.count(), 32, 'printing includes all filtered records');
      await reportPage.emulateMedia({ media: 'print' });
      assert.equal(await workspace.locator('.reports-filter-card').isVisible(), false);
      await reportPage.emulateMedia({ media: 'screen' });
      await reportPage.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await dataRows.nth(24).waitFor();
      assert.equal(await dataRows.count(), 25);
      await workspace.getByRole('combobox', { name: 'Item', exact: true }).selectOption('Masala tea');
      await workspace.getByRole('status').filter({ hasText: '16 records' }).waitFor();
      const search = workspace.getByRole('textbox', { name: 'Search report', exact: true });
      await search.fill('QA-REPORT-001');
      await workspace.getByRole('status').filter({ hasText: '1 record' }).waitFor();
      assert.equal(await dataRows.count(), 1);
      await search.fill('No match for this query');
      await workspace.getByRole('heading', { name: 'No records to display', exact: true }).waitFor();
      await workspace.getByRole('status').filter({ hasText: '0 records' }).waitFor();
      assert.equal(await workspace.locator('.reports-summary').filter({ has: reportPage.getByText('Records', { exact: true }) }).locator('strong').innerText(), '0');
      await capture(reportPage, 'reports-empty-state');
      await workspace.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await workspace.getByRole('status').filter({ hasText: '32 records' }).waitFor();
      const date = workspace.getByLabel('Specific date', { exact: true });
      await date.fill('2000-01-01');
      await workspace.getByRole('heading', { name: 'No records to display', exact: true }).waitFor();
      assert.match(await workspace.locator('.reports-period-caption').innerText(), /2000/);
      await workspace.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await reportPage.setViewportSize({ width: 1024, height: 900 });
      await capture(reportPage, 'reports-laptop');
      await reportPage.setViewportSize({ width: 1440, height: 1000 });
      await reportPage.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await capture(reportPage, 'reports-dark');
      await reportPage.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await reportPage.setViewportSize({ width: 390, height: 844 });
      if (await reportPage.locator('.sidebar-mobile-close').isVisible()) await reportPage.locator('.sidebar-mobile-close').click();
      await capture(reportPage, 'reports-mobile');
      await workspace.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('50');
      assert.equal(await dataRows.count(), 32);
      for (const value of await reportPicker.locator('option').allTextContents()) {
        await reportPicker.selectOption(value);
        await workspace.getByRole('heading', { name: value, exact: true }).waitFor();
        await workspace.locator('.reports-data-table').waitFor();
      }
      await reportPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: report types, filters, sorting, pagination, empty state, all-row CSV/print, date labels, desktop/dark/mobile.');
    }
    if (process.env.CHECK_PURCHASE_ORDERS === '1') {
      const originalRows = new Map(rows);
      put('vestora-inventory-vendors-QA-DESIGN', [{ id: 'VEN-PO', name: 'QA Supplier', gstin: '', phone: '', email: '', address: '' }]);
      put('vestora-inventory-transactions-QA-DESIGN', [{ id: 'QA-LPC', type: 'Purchase', purchaseId: 'PUR-LPC', itemId: 'QA-RICE', item: 'Basmati rice', unit: 'kg', unitCost: 88.5, netUnitCost: 84.25, createdAt: '2026-10-16T10:00:00.000Z' }]);
      const poPage = await contextFor(true, { width: 1440, height: 1000 });
      await poPage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await poPage.getByRole('navigation').getByRole('button', { name: 'Purchase order', exact: true }).click();
      await poPage.getByRole('heading', { name: 'Purchase orders', exact: true }).waitFor();
      await poPage.getByRole('button', { name: 'Create purchase order', exact: true }).click();
      const poForm = poPage.locator('.purchase-order-form');
      await poForm.locator('.purchase-order-meta select').nth(0).selectOption('QA Supplier');
      await poForm.locator('.purchase-order-meta input[type="date"]').nth(1).fill('2026-10-20');
      const poItem = poForm.getByRole('combobox', { name: 'Inventory item 1', exact: true });
      await poItem.fill('rice');
      await poForm.getByRole('option', { name: /Basmati rice/ }).click();
      await poForm.getByLabel('Quantity 1', { exact: true }).fill('2');
      const purchaseRate = poForm.getByLabel('Rate 1', { exact: true });
      assert.equal(await purchaseRate.inputValue(), '126.00', 'product cost is displayed with two currency decimals');
      assert.match(await poForm.locator('.purchase-order-rate-field').innerText(), /LPC.*84\.25.*kg/s);
      await capture(poPage, 'purchase-order-rate-precision');
      await purchaseRate.fill('100');
      await poForm.getByLabel('Discount %', { exact: true }).fill('10');
      const savedOrder = poPage.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-purchase-orders-QA-DESIGN' && response.status() === 200);
      await poForm.getByRole('button', { name: 'Save draft', exact: true }).click();
      await savedOrder;
      const draftOrder = rows.get('vestora-purchase-orders-QA-DESIGN').state_value[0];
      assert.equal(draftOrder.vendor, 'QA Supplier');
      assert.equal(draftOrder.status, 'Draft');
      assert.equal(draftOrder.total, 189);
      assert.equal(rows.get('vestora-inventory-QA-DESIGN').state_value[0].stock, 42, 'purchase order does not change stock');
      const poRow = poPage.getByRole('row').filter({ hasText: draftOrder.poNumber });
      assert.match(await poRow.innerText(), /QA Supplier.*189.*Draft/s);
      const submittedOrder = poPage.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-purchase-orders-QA-DESIGN' && response.status() === 200);
      await poRow.getByRole('button', { name: 'Submit', exact: true }).click();
      await submittedOrder;
      await poPage.waitForFunction((poNumber) => [...document.querySelectorAll('tr')].some((row) => row.textContent.includes(poNumber) && row.textContent.includes('Submitted for approval')), draftOrder.poNumber);
      assert.equal(rows.get('vestora-purchase-orders-QA-DESIGN').state_value[0].status, 'Submitted for approval');
      const approvedOrder = poPage.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-purchase-orders-QA-DESIGN' && response.status() === 200);
      await poRow.getByRole('button', { name: 'Approve', exact: true }).click();
      await approvedOrder;
      await poPage.waitForFunction((poNumber) => [...document.querySelectorAll('tr')].some((row) => row.textContent.includes(poNumber) && row.textContent.includes('Approved')), draftOrder.poNumber);
      const order = rows.get('vestora-purchase-orders-QA-DESIGN').state_value[0];
      assert.equal(order.status, 'Approved');
      assert.match(await poRow.innerText(), /QA Supplier.*189.*Approved/s);
      await capture(poPage, 'purchase-orders-list');
      await poRow.getByRole('button', { name: 'Receive', exact: true }).click();
      await poPage.getByRole('heading', { name: 'Inventory - Purchase entry', exact: true }).waitFor();
      const purchaseDialog = poPage.locator('.purchase-entry-modal');
      await purchaseDialog.waitFor();
      assert.equal(await purchaseDialog.getByRole('combobox', { name: 'Purchase order', exact: true }).inputValue(), order.id);
      assert.equal(await purchaseDialog.locator('.purchase-meta-grid select').nth(1).inputValue(), 'QA Supplier');
      assert.equal(await purchaseDialog.getByRole('combobox', { name: 'Inventory item 1', exact: true }).inputValue(), 'Basmati rice');
      assert.equal(await purchaseDialog.getByLabel('Quantity').first().inputValue(), '2');
      assert.match(await purchaseDialog.getByPlaceholder('Optional delivery note').inputValue(), new RegExp(`From ${order.poNumber}`));
      await capture(poPage, 'purchase-order-to-entry');
      await poPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: purchase order create, tax totals, cloud save, zero stock impact, and approved-order transfer to Purchase Entry.');
      if (process.env.ONLY_PURCHASE_ORDERS === '1') {
        assert.deepEqual(errors, [], 'purchase order browser errors');
        return;
      }
    }
    if (process.env.CHECK_VENDOR_EDIT === '1') {
      const originalRows = new Map(rows);
      put('vestora-inventory-vendors-QA-DESIGN', [{ id: 'VEN-EDIT', name: 'Old Supplier', gstin: '29ABCDE1234F1Z5', phone: '9000000000', email: 'old@example.test', address: 'Old address' }]);
      const vendorPage = await contextFor(true, { width: 1440, height: 1000 });
      await vendorPage.getByRole('navigation').getByRole('button', { name: 'Purchase', exact: true }).click();
      await vendorPage.getByRole('navigation').getByRole('button', { name: 'Vendor creation', exact: true }).click();
      await vendorPage.getByRole('heading', { name: 'Vendor management', exact: true }).waitFor();
      await vendorPage.getByRole('button', { name: 'Edit Old Supplier', exact: true }).click();
      await vendorPage.getByRole('heading', { name: 'Edit vendor', exact: true }).waitFor();
      await vendorPage.getByLabel('Vendor name', { exact: true }).fill('Updated Supplier');
      await vendorPage.getByLabel('Phone', { exact: true }).fill('9111111111');
      await vendorPage.getByLabel('Email', { exact: true }).fill('updated@example.test');
      await vendorPage.getByLabel('Address', { exact: true }).fill('Updated address');
      const saved = vendorPage.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-inventory-vendors-QA-DESIGN' && response.status() === 200);
      await vendorPage.getByRole('button', { name: 'Save changes', exact: true }).click();
      await saved;
      const updatedRow = vendorPage.getByRole('row').filter({ hasText: 'Updated Supplier' });
      await updatedRow.waitFor();
      assert.match(await updatedRow.innerText(), /9111111111.*updated@example\.test.*Updated address/s);
      const savedVendors = rows.get('vestora-inventory-vendors-QA-DESIGN').state_value;
      assert.equal(savedVendors.length, 1, 'editing does not create a duplicate vendor');
      assert.equal(savedVendors[0].id, 'VEN-EDIT', 'editing retains the vendor identity');
      assert.equal(savedVendors[0].name, 'Updated Supplier');
      await vendorPage.getByRole('navigation').getByRole('button', { name: 'Purchase entry', exact: true }).click();
      await vendorPage.getByRole('heading', { name: 'Inventory - Purchase entry', exact: true }).waitFor();
      await vendorPage.getByRole('button', { name: 'Add purchase entry', exact: true }).first().click();
      const vendorSelect = vendorPage.locator('.purchase-entry-modal select').first();
      await vendorSelect.waitFor();
      const vendorOptions = await vendorSelect.locator('option').allTextContents();
      assert.ok(vendorOptions.includes('Updated Supplier'), `updated vendor missing from purchase options: ${vendorOptions.join(', ')}`);
      assert.ok(!vendorOptions.includes('Old Supplier'));
      await capture(vendorPage, 'vendor-edit-and-purchase-selection');
      await vendorPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: vendor edit preserves the record, updates all details, and immediately updates purchase-entry selection.');
    }
    if (process.env.CHECK_BANK_BALANCES === '1') {
      const originalRows = new Map(rows);
      put('vestora-finance-bank-accounts-QA-DESIGN', [
        { id: 'BANK-HDFC', accountName: 'HDFC Current', bankName: 'HDFC Bank', accountNumber: '0011', openingBalance: 1000, isPrimary: true, status: 'Active' },
        { id: 'BANK-SAVINGS', accountName: 'Savings', bankName: 'ABC Bank', accountNumber: '0022', openingBalance: 500, status: 'Active' },
      ]);
      put('vestora-finance-receipts-QA-DESIGN', [
        { id: 'RCT-NAMED', customer: 'Customer A', purpose: 'Food sales', debitAccount: 'HDFC Current', creditAccount: 'Sales', amount: 200, status: 'Received', date: '2026-10-16' },
        { id: 'RCT-GENERIC', customer: 'Customer B', purpose: 'Food sales', debitAccount: 'Bank', creditAccount: 'Sales', amount: 100, status: 'Received', date: '2026-10-16' },
        { id: 'RCT-PENDING', customer: 'Ignored', debitAccount: 'HDFC Current', amount: 9000, status: 'Pending', date: '2026-10-16' },
      ]);
      put('vestora-finance-expenses-QA-DESIGN', [{ id: 'EXP-BANK', category: 'Electricity', creditAccount: 'HDFC Current', amount: 50, status: 'Posted', date: '2026-10-16' }]);
      put('vestora-finance-vendor-payments-QA-DESIGN', [{ id: 'VND-BANK', vendor: 'QA Supplier', invoice: 'INV-1', creditAccount: 'Bank', amount: 70, status: 'Paid', date: '2026-10-16' }]);
      put('vestora-finance-journals-QA-DESIGN', [{ id: 'JRN-TRANSFER', reference: 'TRF-1', status: 'Posted', date: '2026-10-16', lines: [{ account: 'Savings', debit: 300, credit: 0 }, { account: 'HDFC Current', debit: 0, credit: 300 }] }]);
      put('vestora-sales-ledger', [
        { id: 'SALE-UPI', orderNumber: 'ORD-UPI', storeId: 'QA-DESIGN', completedAt: '2026-10-16T10:00:00.000Z', total: 120, payment: 'UPI' },
        { id: 'SALE-CARD', orderNumber: 'ORD-CARD', storeId: 'QA-DESIGN', completedAt: '2026-10-16T10:05:00.000Z', total: 80, payment: 'Card' },
        { id: 'SALE-CASH', orderNumber: 'ORD-CASH', storeId: 'QA-DESIGN', completedAt: '2026-10-16T10:10:00.000Z', total: 999, payment: 'Cash' },
      ]);
      put('vestora-refund-ledger', [{ id: 'REF-UPI', billId: 'SALE-UPI', storeId: 'QA-DESIGN', createdAt: '2026-10-16T11:00:00.000Z', payment: 'UPI', amount: 20, reason: 'QA refund' }]);
      const bankPage = await contextFor(true, { width: 1440, height: 1000 });
      await bankPage.getByRole('navigation').getByRole('button', { name: 'Finance', exact: true }).click();
      await bankPage.getByRole('navigation').getByRole('button', { name: 'Bank accounts', exact: true }).click();
      await bankPage.getByRole('heading', { name: 'Bank accounts', exact: true }).waitFor();
      const hdfcRow = bankPage.getByRole('row').filter({ hasText: 'HDFC Current' }).first();
      assert.match(await hdfcRow.innerText(), /1,000.*500.*440.*1,060.*8/s);
      const savingsRow = bankPage.getByRole('row').filter({ hasText: 'Savings' }).first();
      assert.match(await savingsRow.innerText(), /500.*300.*0.*800.*1/s);
      const activity = bankPage.locator('.bank-activity-table');
      for (const source of ['POS sale', 'POS refund', 'Receipt', 'Expense', 'Vendor payment', 'Journal']) assert.match(await activity.innerText(), new RegExp(source));
      assert.doesNotMatch(await activity.innerText(), /SALE-CASH/);
      await capture(bankPage, 'bank-accounts-ledger');
      await bankPage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: bank balances reflect completed sales, refunds, receipts, expenses, vendor payments, and journals while excluding cash and pending records.');
    }
    if (process.env.CHECK_TABLE_CATALOG === '1') {
      const originalRows = new Map(rows);
      put('vestora-floors-QA-DESIGN', ['Main']);
      put('vestora-tables-QA-DESIGN', [{ id: 'QA-TABLE', name: 'T1', floor: 'Main', seats: 4, status: 'Available' }]);
      const inventory = rows.get('vestora-inventory-QA-DESIGN').state_value;
      put('vestora-inventory-QA-DESIGN', [...inventory.map(item => ({ ...item, eanMrpOptions: [{ barcode: 'ALT-RICE-001' }] })),
        { id: 'inactive-product', name: 'Hidden product', status: 'Inactive', sellingPrice: 100 },
        { id: 'batch-product', parentProductId: 'QA-RICE', name: 'Hidden batch', sellingPrice: 100 }]);
      const tablePage = await contextFor(true, { width: 1440, height: 1000 });
      const openTables = async () => {
        await tablePage.getByRole('navigation').getByRole('button', { name: 'Tables', exact: true }).click();
        await tablePage.locator('.floor button.table').filter({ hasText: 'T1' }).click();
      };
      await openTables();
      await tablePage.getByRole('button', { name: 'Take order', exact: true }).click();
      const dialog = tablePage.getByRole('dialog', { name: 'Order for T1', exact: true });
      const cards = dialog.locator('.waiter-menu-grid button');
      const search = dialog.getByRole('textbox', { name: 'Search table order items', exact: true });
      assert.equal(await cards.count(), 1);
      assert.match(await cards.innerText(), /Garden grain bowl/);
      await dialog.locator('.waiter-category-row').getByRole('button', { name: 'Mains', exact: true }).click();
      for (const query of ['Basmati', 'RICE-001', '890987654321', 'ALT-RICE-001']) {
        await search.fill(query);
        assert.equal(await cards.count(), 1);
        assert.match(await cards.innerText(), /Basmati rice/);
        assert.match(await cards.innerText(), /150/);
      }
      await cards.click();
      await cards.click();
      assert.match(await dialog.locator('.waiter-order-total').innerText(), /300/);
      await capture(tablePage, 'table-product-search');
      await search.fill('Hidden');
      assert.equal(await cards.count(), 0);
      await dialog.getByRole('status').filter({ hasText: 'No matching' }).waitFor();
      await search.fill('');
      assert.equal(await cards.count(), 1, 'clearing table search restores only menu items');
      assert.match(await cards.innerText(), /Garden grain bowl/);
      const savedOrder = tablePage.waitForResponse(response => response.url().endsWith('/api/cloud/state/') && response.request().method() === 'PUT'
        && response.request().postDataJSON()?.key === 'vestora-table-orders' && response.status() === 200);
      await dialog.getByRole('button', { name: 'Save order', exact: true }).click();
      await savedOrder;
      const order = rows.get('vestora-table-orders').state_value.find(item => item.tableId === 'QA-TABLE');
      assert.equal(order.subtotal, 300);
      assert.equal(order.items[0].id, 'QA-RICE');
      assert.equal(order.items[0].price, 150);
      assert.equal(order.items[0].tax, 5);
      assert.equal(order.items[0].qty, 2);
      assert.equal(order.items[0].productMasterItem, true);
      await tablePage.reload();
      await openTables();
      await tablePage.getByRole('button', { name: 'Add on', exact: true }).click();
      assert.match(await dialog.locator('.waiter-cart-lines').innerText(), /Basmati rice/);
      assert.match(await dialog.locator('.waiter-order-total').innerText(), /300/);
      await tablePage.setViewportSize({ width: 390, height: 844 });
      await search.fill('RICE-001');
      await capture(tablePage, 'table-product-search-mobile');
      await tablePage.context().close();
      rows.clear();
      for (const [key, value] of originalRows) rows.set(key, value);
      console.log('PASS: table menu-only browsing, Product Master name/SKU/EAN search across categories, correct price/GST, hidden inactive/batches, save/reload and mobile.');
    }
    if (process.env.CHECK_POS_CATALOG === '1') {
      const pos = await contextFor(true, { width: 1440, height: 1000 });
      await pos.getByRole('navigation').getByRole('button', { name: 'POS Billing', exact: true }).click();
      await pos.getByRole('button', { name: /Jordan Lee/ }).click();
      await pos.getByPlaceholder('Enter cashier password').fill('mock-password');
      await pos.getByRole('button', { name: 'Continue to POS' }).click();
      await pos.locator('.shift-balance-field input').fill('0');
      await pos.getByRole('button', { name: 'Open shift', exact: true }).click();
      const cards = pos.locator('.pos-catalog .item-card');
      await cards.filter({ hasText: 'Garden grain bowl' }).waitFor();
      assert.equal(await cards.count(), 1, 'only saved menu items appear before searching');
      const search = pos.getByPlaceholder('Search item or scan barcode');
      await search.fill('Basmati');
      await cards.filter({ hasText: 'Basmati rice' }).waitFor();
      assert.equal(await cards.count(), 1);
      await capture(pos, 'pos-product-search');
      await search.fill('');
      await cards.filter({ hasText: 'Garden grain bowl' }).waitFor();
      assert.equal(await cards.count(), 1, 'clearing search restores only menu items');
      await capture(pos, 'pos-menu-catalog');
      await pos.context().close();
      console.log('PASS: POS shows saved menu items; Product Master is search-only.');
    }
    await page.getByRole('textbox', { name: 'Find a module' }).fill('invent');
    await page.getByRole('navigation').getByRole('button', { name: 'Inventory', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Clear module search' }).click();
    for (const name of ['Inventory', 'Menu', 'Production', 'Tables', 'KDS', 'CRM', 'Offers & Promotions', 'Finance', 'Reports', 'Admin', 'Settings']) {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
      await page.locator('main > .screen').waitFor();
      await capture(page, name.toLowerCase().replace(/[^a-z]+/g, '-'));
    }
    await page.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await page.locator('.app.dark').waitFor();
    await capture(page, 'dashboard-dark');
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.getByRole('button', { name: 'Close navigation', exact: true }).first().isVisible()) await page.locator('.sidebar-mobile-close').click();
    await capture(page, 'dashboard-mobile');
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
    await capture(page, 'navigation-mobile');
    await page.getByRole('navigation').getByRole('button', { name: 'Inventory', exact: true }).click();
    assert.equal(await page.locator('.app.sidebar-collapsed').count(), 1);
    await capture(page, 'inventory-mobile');
    const admin = await contextFor(true, { width: 1440, height: 1000 }, true);
    await admin.locator('.super-admin-landing').waitFor();
    await capture(admin, 'store-directory');
    assert.deepEqual(errors, [], 'browser errors');
    console.log(`PASS: sign-in, dashboard, 11 modules, search, dark mode, mobile navigation and store directory. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
