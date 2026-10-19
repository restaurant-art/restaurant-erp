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
    const page=await contextFor(true,{width:1440,height:1000});
    await page.getByRole('heading',{name:'Your business, at a glance.'}).waitFor();
    await page.waitForFunction(()=>window.vestoraCloudStateReady===true);
    const nav=page.getByRole('navigation');
    await nav.getByRole('button',{name:'Finance',exact:true}).click();
    const dialog=page.getByRole('dialog');
    const checkDialog=async name=>{
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-modal'),'true');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
      assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
      assert.equal(await page.locator('.finance-workspace > form').count(),0);
      const rect=await dialog.boundingBox();
      assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=page.viewportSize().width+1);
      await page.screenshot({path:path.join(output,name+'.png')});
    };
    await nav.getByRole('button',{name:'Expenses',exact:true}).click();
    await page.getByRole('button',{name:'Add expense',exact:true}).click();
    await checkDialog('finance-expense-popup');
    await dialog.getByRole('button',{name:'Save expense',exact:true}).click();
    await page.locator('.toast').filter({hasText:'Enter an expense category'}).waitFor();
    assert.equal(await dialog.count(),1);
    await dialog.getByLabel('Purpose / amount gone for').selectOption({index:1});
    await dialog.getByLabel('Amount',{exact:true}).fill('125');
    await dialog.getByLabel('Reference',{exact:true}).fill('QA-EXP-POPUP');
    await dialog.getByRole('button',{name:'Save expense',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    assert.match(await page.locator('.topbar h1').innerText(),/Expenses/);
    await page.locator('tr').filter({hasText:'QA-EXP-POPUP'}).getByRole('button',{name:/Edit/}).click();
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Amount',{exact:true}).inputValue(),'125');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');

    await nav.getByRole('button',{name:'Receipts',exact:true}).click();
    await page.getByRole('button',{name:'Record receipt',exact:true}).click();
    await checkDialog('finance-receipt-popup');
    await dialog.getByLabel('Customer',{exact:true}).fill('QA Popup customer');
    await dialog.getByLabel('Amount',{exact:true}).fill('250');
    await dialog.getByRole('button',{name:'Save receipt',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    assert.match(await page.locator('.topbar h1').innerText(),/Receipts/);
    await page.locator('tr').filter({hasText:'QA Popup customer'}).getByRole('button',{name:/Edit/}).click();
    await dialog.waitFor();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();

    for(const [view,action] of [['Bank accounts','Add bank account'],['Vendor payments','Record vendor payment'],['Journal entries','Record journal'],['General ledger','Post journal entry']]){
      await nav.getByRole('button',{name:view,exact:true}).click();
      const opener=page.getByRole('button',{name:action,exact:true});
      await opener.click();
      await checkDialog('finance-'+view.replaceAll(' ','-')+'-popup');
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await dialog.waitFor({state:'detached'});
      assert.ok(await opener.evaluate(el=>el===document.activeElement),'focus returns to action');
    }
    await page.getByRole('button',{name:'Create ledger',exact:true}).click();
    await checkDialog('finance-ledger-popup');
    await dialog.getByLabel('Ledger name',{exact:true}).fill('QA Popup ledger');
    await dialog.getByRole('button',{name:'Save ledger',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    assert.match(await page.locator('.topbar h1').innerText(),/General Ledger/);
    await page.getByRole('button',{name:'Post journal entry',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await checkDialog('finance-journal-mobile-popup');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log('PASS: Finance add/edit popups, validation, save staying on page, Cancel/Escape, focus restoration, bank/vendor/journal/ledger forms and mobile layout.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

