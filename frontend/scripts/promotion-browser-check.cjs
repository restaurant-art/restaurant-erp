// Local visual smoke test. All API traffic is intercepted; no production records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/aswin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8000';
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
    put('vestora-offers-QA-DESIGN', []);
    const page = await contextFor(true, {width:1440,height:1000});
    await page.getByRole('heading',{name:'Your business, at a glance.'}).waitFor();
    await page.waitForFunction(()=>window.vestoraCloudStateReady===true);
    await page.getByRole('navigation').getByRole('button',{name:'Offers & Promotions',exact:true}).click();
    await page.locator('.promo-template').first().waitFor();
    assert.equal(await page.locator('.promo-template').count(),14);
    assert.equal(await page.locator('.promo-workspace select').count(),0);
    await capture(page,'promotions-desktop');
    const names=await page.locator('.promo-template').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
    for(const name of names){
      await page.getByRole('button',{name,exact:true}).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('dialog').getByLabel('Offer name').count(),1);
      await page.getByRole('button',{name:'Close promotion editor'}).click();
    }
    await page.getByRole('button',{name:'Create % off items',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Offer name').fill('QA ten percent');
    await dialog.getByLabel('Discount percentage',{exact:true}).fill('10');
    await dialog.getByRole('button',{name:'Active',exact:true}).click();
    await capture(page,'promotion-editor-desktop');
    await dialog.getByRole('button',{name:'Save offer',exact:true}).click();
    const saved=page.locator('.promo-saved').filter({hasText:'QA ten percent'});
    await saved.waitFor();
    await saved.getByRole('button',{name:'Pause',exact:true}).click();
    await saved.locator('.promo-status-paused').waitFor();
    await saved.getByRole('button',{name:'Activate',exact:true}).click();
    await saved.locator('.promo-status-active').waitFor();
    await saved.getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await dialog.getByLabel('Discount percentage',{exact:true}).inputValue(),'10');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.reload();
    await page.waitForFunction(()=>window.vestoraCloudStateReady===true);
    await page.getByRole('navigation').getByRole('button',{name:'Offers & Promotions',exact:true}).click();
    await page.locator('.promo-saved').filter({hasText:'QA ten percent'}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.locator('.sidebar-mobile-close').click();
    await capture(page,'promotions-mobile');
    await page.getByRole('button',{name:'Create Quantity tiers',exact:true}).click();
    await capture(page,'promotion-editor-mobile');
    await page.getByRole('button',{name:'Close promotion editor'}).click();

    const pos=await contextFor(true,{width:1440,height:1000});
    await pos.getByRole('navigation').getByRole('button',{name:'POS Billing',exact:true}).click();
    await pos.getByRole('button',{name:/Jordan Lee/}).click();
    await pos.getByPlaceholder('Enter cashier password').fill('mock-password');
    await pos.getByRole('button',{name:'Continue to POS'}).click();
    await pos.locator('.shift-balance-field input').fill('0');
    await pos.getByRole('button',{name:'Open shift',exact:true}).click();
    await pos.locator('.pos-catalog .item-card').filter({hasText:'Garden grain bowl'}).click();
    await pos.getByLabel('Choose active offer').selectOption({label:'QA ten percent · % off items'});
    await pos.locator('.pos-offer-apply').getByRole('button',{name:'Apply',exact:true}).click();
    await pos.locator('.pos-offer-applied').filter({hasText:'QA ten percent'}).waitFor();
    await capture(pos,'promotion-pos');
    const billText=await pos.locator('.bill-panel').innerText();
    assert.match(billText,/Discount\s+₹28/);
    assert.match(billText,/Grand total\s+₹265/);
    assert.deepEqual(errors,[]);
    console.log('PASS: 14 templates, editors, create/persist/edit/pause/reactivate, responsive layouts, POS application and no runtime errors.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

