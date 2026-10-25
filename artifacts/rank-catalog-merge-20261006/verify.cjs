const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require(path.join(require('os').tmpdir(), 'maritime-ui-verification/node_modules/playwright'));
const baseUrl = process.env.EDGE_UI_URL || 'http://127.0.0.1:3102';
const user = { id: 1, username: 'review', fullName: 'Review', role: 'ADMIN', roleCode: 'ADMIN', roles: ['ADMIN'], isActive: true };
const ranks = [
  { id: 1, rankCode: 'MST', rankName: 'Master', department: 'DECK', level: 'Management', sortOrder: 1, isActive: true },
  { id: 2, rankCode: 'C/E', rankName: 'Chief Engineer', department: 'ENGINE', level: 'Management', sortOrder: 2, isActive: true },
  { id: 3, rankCode: 'OLD', rankName: 'Inactive rank', department: 'DECK', level: null, sortOrder: 3, isActive: false },
];
const cert = { id: 1, certificateCode: 'STCW', certificateName: 'STCW competency', category: 'COMPETENCY', isActive: true, crewCount: 1 };
const fireCert = { id: 2, certificateCode: 'FIRE', certificateName: 'Fire safety', category: 'SAFETY', isActive: true, crewCount: 0 };
const requirements = [{ id: 1, rankId: 1, certificateId: 1, certificate: cert }];
const crew = [
  { id: '00000000-0000-0000-0000-000000000001', crewId: 'TV001', fullName: 'Alice Brown', rankId: 1, rank: ranks[0], isOnboard: true },
  { id: '00000000-0000-0000-0000-000000000002', crewId: 'TV002', fullName: 'Bob Green', rankId: 1, rank: ranks[0], isOnboard: true },
];
const certificatesByCrew = {
  [crew[0].id]: [{ id: 1, crewMemberId: crew[0].id, certificateId: 1, certificate: cert, certificateNumber: 'TEST-001', status: 'VALID', issueDate: '2024-01-01T00:00:00Z', expiryDate: '2030-01-01T00:00:00Z' }],
  [crew[1].id]: [],
};
const requests = [];
const errors = [];
let failRequirements = false;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    await context.addInitScript(({ user }) => {
      localStorage.setItem('authToken', 'ui-review-token');
      localStorage.setItem('maritime-auth', JSON.stringify({ state: { user, accessToken: 'ui-review-token', expiresAt: Date.now() + 3600000, mustChangePassword: false }, version: 0 }));
      const vietnamese = sessionStorage.getItem('review-vietnamese');
      localStorage.setItem('maritime-edge-settings', JSON.stringify({ state: { language: vietnamese ? 'vi' : 'en', theme: vietnamese ? 'dark' : 'light', fontSize: 'medium' }, version: 0 }));
    }, { user });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(request.method(), 'GET', `Unexpected mutation: ${url.pathname}`);
      requests.push(url.pathname);
      let data = [];
      if (url.pathname.endsWith('/auth/me')) data = user;
      else if (url.pathname.endsWith('/auth/validate')) data = { isValid: true, user };
      else if (url.pathname.endsWith('/crew/onboard')) data = crew;
      else if (url.pathname.endsWith('/ranks')) {
        assert.equal(url.searchParams.get('includeInactive'), 'true');
        data = ranks;
      } else if (url.pathname.endsWith('/rank-certificates')) {
        if (failRequirements) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test failure"}' });
        data = requirements;
      } else if (url.pathname.includes('/rank-certificates/rank/')) {
        data = requirements.filter(r => r.rankId === Number(url.pathname.split('/').pop()));
      } else if (url.pathname.endsWith('/certificates/crew/bulk')) data = certificatesByCrew;
      else if (url.pathname.endsWith('/certificates/with-crew-count')) data = [cert, fireCert];
      else if (url.pathname.includes('/certificates')) data = [cert, fireCert];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto(`${baseUrl}/crew/ranks`);
    await page.waitForURL('**/crew/certificates?tab=ranks');
    const master = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'MST', exact: true }) });
    await master.getByText('1 Compliant', { exact: true }).waitFor();
    assert.equal(await master.getByRole('cell').count(), 9);
    assert.equal(await master.getByRole('cell').nth(6).innerText(), '1');
    assert.equal(await master.getByRole('cell').nth(7).innerText(), '2');
    await master.getByText('1 Missing', { exact: true }).waitFor();
    assert.equal(await page.locator('a[href="/crew/ranks"]').count(), 0, 'Duplicate sidebar entry must be removed');
    assert.equal(await page.getByRole('cell', { name: 'Inactive rank', exact: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'Include inactive ranks' }).check();
    await page.getByRole('cell', { name: 'Inactive rank', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Department', exact: true }).selectOption('ENGINE');
    await page.getByRole('cell', { name: 'Chief Engineer', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'MST', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Department', exact: true }).selectOption('');
    const search = page.getByRole('textbox', { name: 'Search code, name or level' });
    await search.fill('MST');
    await page.getByRole('button', { name: 'MST', exact: true }).click();
    const detail = page.locator('#rank-detail-1');
    await detail.getByText('STCW competency', { exact: true }).waitFor();
    await detail.getByText('Alice Brown', { exact: true }).waitFor();
    await detail.getByText('Bob Green', { exact: true }).waitFor();
    assert.equal(Number(await detail.getAttribute('colspan')), 9);
    await page.screenshot({ path: path.join(__dirname, 'merged-expanded.png'), fullPage: true });
    await page.getByRole('button', { name: 'MST', exact: true }).click();
    await search.fill('nothing matches');
    await page.getByText("No matching ranks. If the catalog is empty, check synchronization from shore.", { exact: true }).waitFor();
    await search.fill('');

    ranks[0].rankName = 'Master updated';
    ranks.push({ id: 4, rankCode: 'NEW', rankName: 'New synced rank', department: 'DECK', sortOrder: 4, isActive: true });
    requirements.push({ id: 2, rankId: 1, certificateId: 2, certificate: fireCert });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('cell', { name: 'New synced rank', exact: true }).waitFor();
    await master.getByText('1 Partial', { exact: true }).waitFor();
    assert.equal(await master.getByRole('cell').nth(6).innerText(), '2');
    await page.screenshot({ path: path.join(__dirname, 'merged-desktop.png'), fullPage: true });
    assert.equal(requests.filter(url => url.includes('/rank-certificates/rank/')).length, 0, 'Requirements must use the batch endpoint');

    failRequirements = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Unable to load ranks' }).waitFor();
    failRequirements = false;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('cell', { name: 'Master updated', exact: true }).waitFor();
    await page.getByRole('button', { name: /^Certificate Types/ }).click();
    await page.waitForURL('**/crew/certificates?tab=certTypes');
    await page.getByText('STCW competency', { exact: true }).waitFor();
    await page.goBack();
    await page.waitForURL('**/crew/certificates?tab=ranks');
    await page.getByRole('button', { name: 'MST', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'MST', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'MST', exact: true }).waitFor();
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must not overflow mobile viewport');
    await page.screenshot({ path: path.join(__dirname, 'merged-mobile.png'), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { sessionStorage.setItem('review-vietnamese', 'true'); localStorage.setItem('sidebar-collapsed', 'false'); });
    await page.reload();
    await page.getByRole('cell', { name: 'Master updated', exact: true }).waitFor();
    await page.getByRole('columnheader', { name: 'Bộ phận' }).waitFor();
    await page.screenshot({ path: path.join(__dirname, 'merged-vietnamese-dark.png'), fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ passed: true, baseUrl, mockedApi: true, errors, checks: ['legacy redirect', 'single menu', 'catalog columns', 'filters', 'inactive ranks', 'crew compliance', 'expanded requirements', 'batch API', 'refresh', 'API error recovery', 'query tab navigation and reload', 'mobile', 'Vietnamese dark theme'] }, null, 2));
    console.log('PASS: merged rank catalog and certificate compliance.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
