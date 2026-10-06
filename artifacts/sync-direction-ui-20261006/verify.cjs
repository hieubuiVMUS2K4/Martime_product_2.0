const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require(path.join(require('os').tmpdir(), 'maritime-ui-verification/node_modules/playwright'));

const base = process.env.EDGE_UI_URL || 'http://127.0.0.1:3102';
const user = { id: 1, username: 'review', fullName: 'Review', role: 'ADMIN', roleCode: 'ADMIN', roles: ['ADMIN'], isActive: true };
let ranks = [
  { id: 1, rankCode: 'MST', rankName: 'Master', department: 'DECK', level: 'Management', sortOrder: 1, isActive: true },
  { id: 2, rankCode: 'C/E', rankName: 'Chief Engineer', department: 'ENGINE', level: 'Management', sortOrder: 2, isActive: true },
  { id: 3, rankCode: 'OLD', rankName: 'Inactive rank', department: 'DECK', level: null, sortOrder: 3, isActive: false },
];
const certificate = { id: 1, certificateCode: 'STCW', certificateName: 'STCW competency', isActive: true, crewCount: 0 };
let failRequirements = false;
let rankReads = 0;
const errors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    await context.addInitScript(({ user }) => {
      localStorage.setItem('authToken', 'ui-review-token');
      localStorage.setItem('maritime-auth', JSON.stringify({ state: { user, accessToken: 'ui-review-token', expiresAt: Date.now() + 3600000, storedRefreshToken: null, mustChangePassword: false }, version: 0 }));
      localStorage.setItem('maritime-edge-settings', JSON.stringify({ state: { language: sessionStorage.getItem('ui-review-vietnamese') ? 'vi' : 'en', theme: sessionStorage.getItem('ui-review-vietnamese') ? 'dark' : 'light', fontSize: 'medium' }, version: 0 }));
    }, { user });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      assert.equal(route.request().method(), 'GET', `Unexpected mutation: ${url.pathname}`);
      let data = [];
      if (url.pathname.endsWith('/auth/me')) data = user;
      else if (url.pathname.endsWith('/auth/validate')) data = { isValid: true, user };
      else if (url.pathname.endsWith('/ranks')) {
        rankReads++;
        data = url.searchParams.get('includeInactive') ? ranks : ranks.filter(rank => rank.isActive);
      } else if (url.pathname.endsWith('/rank-certificates')) {
        if (failRequirements) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test failure"}' });
        data = [{ id: 1, rankId: 1, certificateId: 1, certificate }];
      } else if (url.pathname.includes('/rank-certificates/rank/')) data = [];
      else if (url.pathname.includes('/certificates')) data = [certificate];
      else if (url.pathname.endsWith('/ports')) data = { data: [{ id: 1, portCode: 'VNSGN', portName: 'Saigon', isActive: true }], pagination: { totalCount: 1, totalPages: 1, currentPage: 1, pageSize: 20 } };
      else if (url.pathname.includes('/sync/')) data = {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${base}/crew/ranks`);
    await page.getByRole('heading', { name: 'Rank catalog' }).waitFor();
    await page.getByRole('cell', { name: 'Master', exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: 'Inactive rank', exact: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'Include inactive ranks' }).check();
    await page.getByRole('cell', { name: 'Inactive rank', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Department' }).selectOption('ENGINE');
    assert.equal(await page.getByRole('cell', { name: 'Master', exact: true }).count(), 0);
    await page.getByRole('cell', { name: 'Chief Engineer', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Department' }).selectOption('');
    await page.getByRole('textbox', { name: 'Search code, name or level' }).fill('MST');
    await page.getByRole('button', { name: '1 certificates' }).click();
    await page.getByText('STCW · STCW competency', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Search code, name or level' }).fill('');
    ranks[0].rankName = 'Master updated';
    ranks.push({ id: 4, rankCode: 'NEW', rankName: 'New rank', department: 'DECK', sortOrder: 4, isActive: true });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('cell', { name: 'Master updated', exact: true }).waitFor();
    await page.getByRole('cell', { name: 'New rank', exact: true }).waitFor();
    await page.screenshot({ path: path.join(__dirname, 'ranks-desktop.png'), fullPage: true });
    failRequirements = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Unable to load ranks' }).waitFor();
    failRequirements = false;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('cell', { name: 'Master updated', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(__dirname, 'ranks-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must not overflow the viewport');
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${base}/crew/certificates`);
    await page.getByRole('button', { name: /Certificates for Ranks/i }).waitFor();
    const beforeRefresh = rankReads;
    ranks.push({ id: 5, rankCode: 'NEW2', rankName: 'Fresh synced rank', department: 'DECK', sortOrder: 5, isActive: true });
    await page.getByRole('button', { name: /Refresh/i }).click();
    await page.getByRole('button', { name: /Certificates for Ranks/i }).click();
    await page.getByText('Fresh synced rank', { exact: true }).waitFor();
    assert.ok(rankReads > beforeRefresh, 'Certificate refresh must reload ranks');
    await page.goto(`${base}/ports`);
    await page.getByText('Saigon', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Add Port|Edit|Delete|Deactivate/i }).count(), 0);
    await page.screenshot({ path: path.join(__dirname, 'ports-readonly.png'), fullPage: true });
    await page.evaluate(() => { sessionStorage.setItem('ui-review-vietnamese', 'true'); localStorage.setItem('sidebar-collapsed', 'false'); });
    await page.goto(`${base}/crew/ranks`);
    await page.getByRole('heading', { name: 'Danh sách chức danh' }).waitFor();
    await page.getByRole('cell', { name: 'Master updated', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'Dark theme should apply');
    await page.screenshot({ path: path.join(__dirname, 'ranks-vietnamese-dark.png'), fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ passed: true, baseUrl: base, rankReads, errors, checks: ['filters', 'requirements', 'refresh', 'error recovery', 'mobile', 'certificate tab refresh', 'read-only ports', 'Vietnamese', 'dark theme'], mockedApi: true }, null, 2));
    console.log('PASS: ranks, filters, certificate requirements, refresh, error recovery, mobile, certificate tab, read-only ports.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
