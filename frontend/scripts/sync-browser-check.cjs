// Two isolated browsers, a shared mock backend, and no production requests.
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/aswin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.SYNC_TEST_URL || 'http://127.0.0.1:4188';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const stores = [{ id: 'QA-A', name: 'Sync Test Restaurant', branch: 'Main branch', status: 'Active', type: 'Store', address: 'Test only' }];
  const rows = new Map([['vestora-stores', { state_key: 'vestora-stores', state_value: stores, updated_at: '1' }]]);
  const operations = new Map();
  let version = 1;
  const errors = [];
  const profile = { id: 'qa-user', name: 'QA Admin', role: 'super_admin', appRole: 'Super Admin', isSuperuser: true, storeId: 'QA-A', allowedStoreIds: ['QA-A'] };
  let staffAccountRequests = 0;
  const authUser = { id: 'qa-user', aud: 'authenticated', role: 'authenticated', email: 'qa@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'qa-user', exp })).toString('base64url') + '.test';
  async function open({ failProfile = false, failState = false, profileOverride = profile } = {}) {
    const context = await browser.newContext();
    await context.route('**/*.supabase.co/**', async (route) => {
      const req = route.request(), url = new URL(req.url());
      let data = [], code = 200;
      if (url.pathname.includes('/auth/v1/user')) data = authUser;
      else if (url.pathname.endsWith('/profile')) {
        data = failProfile ? { message: 'Invalid JWT' } : profileOverride;
        if (failProfile) code = 401;
      }
      else if (url.pathname.endsWith('/staff-account')) { staffAccountRequests++; data = { authUserId: `staff-${staffAccountRequests}` }; }
      else if (url.pathname.endsWith('/state')) {
        if (failState) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Store access could not be verified' }) }); return; }
        if (req.method() === 'PUT') {
          const body = req.postDataJSON();
          if (operations.has(body.mutationId)) data = operations.get(body.mutationId);
          else if ((rows.get(body.key)?.updated_at ?? null) !== body.expectedUpdatedAt) { code = 409; data = { error: 'Conflict' }; }
          else {
            data = { state_key: body.key, state_value: body.value, updated_at: String(++version) };
            rows.set(body.key, data); operations.set(body.mutationId, data);
          }
        } else data = url.searchParams.has('key') ? (rows.has(url.searchParams.get('key')) ? [rows.get(url.searchParams.get('key'))] : []) : [...rows.values()];
      }
      await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    });
    await context.addInitScript(({ token, exp, authUser, profile }) => {
      localStorage.setItem('sb-vqinmequtjkuzrtzkzsk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: authUser }));
      localStorage.setItem('vestora-current-user', JSON.stringify(profile));
      localStorage.setItem('vestora-selected-store', 'QA-A');
      localStorage.setItem('vestora-super-admin-in-store', 'true');
    }, { token, exp, authUser, profile: profileOverride });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    if (failProfile || failState) {
      await page.getByRole('heading', { name: 'Store connection needs attention' }).waitFor();
      await page.getByRole('alert').filter({ hasText: failProfile ? 'Invalid JWT [profile: 401]' : 'Store access could not be verified [state: 503]' }).waitFor();
      assert.equal(await page.locator('nav').count(), 0, 'failed verification must not expose store modules');
      failProfile = false; failState = false;
      await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    }
    if (profileOverride.isSuperuser) {
      await page.getByRole('button', { name: 'View branch', exact: true }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'View branch', exact: true }).click();
    }
    try { await page.getByRole('button', { name: 'Tables', exact: true }).waitFor({ timeout: 15000 }); }
    catch (error) { console.log('Browser errors:', errors); console.log('Page:', await page.locator('body').innerText()); throw error; }
    return page;
  }
  try {
    const recoveredProfile = await open({ failProfile: true });
    await recoveredProfile.context().close();
    console.log('PASS: profile failure is visible and retry loads the store without reloading or clearing records');
    const recoveredState = await open({ failState: true });
    await recoveredState.context().close();
    console.log('PASS: shared-state failure is visible and retry recovers');
    const owner = await open({ profileOverride: { ...profile, id: 'qa-owner', role: 'owner', appRole: 'Restaurant Owner', isSuperuser: false } });
    await owner.locator('nav').getByRole('button', { name: 'Admin', exact: true }).click();
    await owner.getByRole('button', { name: 'User creation', exact: true }).click();
    await owner.getByLabel('Name', { exact: true }).fill('QA Branch Cashier');
    await owner.getByLabel('Email', { exact: true }).fill('qa-branch-cashier@example.test');
    await owner.getByLabel('Password', { exact: true }).fill('test-only-password');
    await owner.getByRole('button', { name: 'Create new user', exact: true }).click();
    await owner.getByText('New user created', { exact: true }).waitFor();
    assert.equal(staffAccountRequests, 1, 'restaurant owners must create staff through the secure account endpoint');
    await owner.context().close();
    console.log('PASS: a restaurant owner can create a branch user');
    const a = await open(), b = await open();
    await a.getByRole('button', { name: 'Tables', exact: true }).click();
    await b.getByRole('button', { name: 'Tables', exact: true }).click();
    await a.getByRole('button', { name: 'Add table', exact: true }).click();
    await a.getByLabel('Table name', { exact: true }).fill('Shared QA Table');
    await a.locator('form.table-setup').getByRole('button', { name: 'Add table', exact: true }).click();
    await b.getByRole('button', { name: /Shared QA Table/ }).waitFor({ timeout: 15000 });
    console.log('PASS: table created through the UI appeared on an already-open second browser');
    await a.getByRole('button', { name: 'Inventory', exact: true }).click();
    await b.getByRole('button', { name: 'Inventory', exact: true }).click();
    await a.getByRole('button', { name: 'Add inventory item', exact: true }).click();
    await a.getByLabel('Item name', { exact: true }).fill('Shared QA Rice');
    await a.getByLabel('Current stock', { exact: true }).fill('10');
    await a.getByLabel('Reorder level', { exact: true }).fill('5');
    await a.locator('.inventory-money-input input').fill('20');
    await a.getByRole('button', { name: 'Save item', exact: true }).click();
    try { await b.getByText('Shared QA Rice', { exact: true }).waitFor({ timeout: 15000 }); }
    catch (error) { console.log('Source:', await a.locator('body').innerText()); console.log('Destination:', await b.locator('body').innerText()); throw error; }
    console.log('PASS: inventory created through the UI appeared on an already-open second browser');
    for (const module of ['Menu', 'Inventory', 'Production', 'CRM', 'Offers & Promotions', 'Attendance', 'Finance', 'Reports', 'Admin', 'Settings', 'KDS', 'Dashboard']) {
      console.log('Checking module:', module);
      await a.locator('nav').getByRole('button', { name: module, exact: true }).click();
      try { await a.locator('main').waitFor({ timeout: 10000 }); }
      catch (error) { console.log('Browser errors:', errors); console.log('Page:', await a.locator('body').innerText()); throw error; }
      await a.waitForTimeout(120);
      assert.equal(errors.length, 0, module + ': ' + errors.join('; '));
    }
    console.log('PASS: every staff module renders without browser errors');
    await b.reload();
    await b.getByRole('button', { name: 'Tables', exact: true }).click();
    await b.getByRole('button', { name: /Shared QA Table/ }).waitFor();
    console.log('PASS: shared record remains after reload');
    assert.equal(errors.length, 0, errors.join('; '));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
