const path = require('path');
const { chromium } = require(
  path.join(
    require('os').tmpdir(),
    'maritime-ui-verification/node_modules/playwright',
  ),
);
const assert = require('assert/strict');
const now = '2026-10-06T01:00:00Z';
const nodes = [
  {
    nodeId: 'edge-star',
    shipName: 'BIENDONG STAR',
    isOnline: true,
    currentNetworkType: 'Shore_WiFi',
    push: {
      lastAt: now,
      totalReceived: 150,
      lastBatchSize: 10,
      lastVersion: 123,
    },
    pull: { lastAt: now, totalDelivered: 90, pending: 3, lastAckedId: 100 },
    health: { lastHeartbeat: now, consecutiveFailures: 0 },
    security: { isRegistered: true, isRevoked: false, keyVersion: 1 },
  },
];
const logs = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  direction: 'EDGE_TO_SHORE',
  originNode: 'edge-star',
  tableName: 'port',
  recordKey: `record-${i + 1}`,
  actionType: 'UPDATE',
  status: i % 3 ? 'SUCCESS' : 'CONFLICT',
  conflictDetail:
    i % 3 ? null : 'Version conflict: source version precedes current version.',
  processedAt: now,
}));
const queue = {
  total: 3,
  page: 1,
  totalPages: 1,
  pageSize: 25,
  groups: [
    { node: '*', tableName: 'rank_certificate', pending: 3, oldestAt: now },
  ],
  items: [1, 2, 3].map((i) => ({
    id: i,
    targetNode: '*',
    tableName: 'rank_certificate',
    recordKey: String(i),
    actionType: 'CREATE',
    createdAt: now,
  })),
};
const ranks = [
  {
    id: 1,
    rankCode: 'ABD',
    rankName: 'Able Seafarer Deck Rating (Thủy thủ trực ca AB)',
    department: 'DECK',
    isActive: true,
  },
];
const certs = [
  {
    id: 1,
    certificateCode: 'COC',
    certificateName:
      'Certificate of Competency (Giấy chứng nhận khả năng chuyên môn)',
    issuingAuthority: 'Cục hàng hải',
    category: 'COMPETENCY',
    validityPeriodMonths: 60,
    isMandatory: true,
    isActive: true,
  },
  {
    id: 2,
    certificateCode: 'BST',
    certificateName: 'Basic Safety Training (Huấn luyện an toàn cơ bản)',
    issuingAuthority: 'Trung tâm huấn luyện hàng hải',
    category: 'SAFETY',
    validityPeriodMonths: 60,
    isMandatory: true,
    isActive: true,
  },
];
let mappings = [{ id: 1, rankId: 1, certificateId: 1 }];
let saves = 0;
const user = {
  id: 1,
  username: 'admin',
  fullName: 'Administrator',
  role: 'ADMIN',
  roles: ['ADMIN'],
  isActive: true,
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1536, height: 900 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });
    await context.addInitScript(
      ({ user }) => {
        localStorage.setItem('authToken', 'ui-review-token');
        localStorage.setItem(
          'maritime-auth',
          JSON.stringify({
            state: {
              user,
              accessToken: 'ui-review-token',
              storedRefreshToken: null,
              expiresAt: Date.now() + 3600000,
              mustChangePassword: false,
            },
            version: 0,
          }),
        );
      },
      { user },
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname;
      let result = [];
      if (endpoint.endsWith('/auth/me')) result = user;
      else if (endpoint.endsWith('/auth/validate'))
        result = { isValid: true, user };
      else if (endpoint.endsWith('/sync/status'))
        result = {
          nodes,
          outboxStats: [{ node: '*', pending: 3 }],
          recentLogs: logs.slice(0, 20),
          serverTime: now,
        };
      else if (endpoint.endsWith('/sync/dashboard/nodes')) result = nodes;
      else if (endpoint.endsWith('/sync/dashboard/outbox')) result = queue;
      else if (endpoint.endsWith('/sync/dashboard/logs')) {
        const status = url.searchParams.get('status');
        const rows = logs.filter((l) => !status || l.status === status);
        const size = Number(url.searchParams.get('pageSize') || 25);
        const current = Number(url.searchParams.get('page') || 1);
        result = {
          total: rows.length,
          page: current,
          pageSize: size,
          totalPages: Math.max(1, Math.ceil(rows.length / size)),
          items: rows.slice((current - 1) * size, current * size),
          summary: ['SUCCESS', 'CONFLICT'].map((status) => ({
            status,
            count: rows.filter((r) => r.status === status).length,
          })),
        };
      } else if (endpoint.endsWith('/sync/dashboard/integrity'))
        result = {
          timestamp: now,
          healthy: true,
          counts: {},
          syncGaps: {
            unsyncedCrew: 0,
            unsyncedCerts: 0,
            orphanCertificates: 0,
            staleOutboxItems: 0,
          },
        };
      else if (endpoint.endsWith('/sync/reconcile')) result = { count: 2 };
      else if (endpoint.endsWith('/certificates')) result = certs;
      else if (endpoint.endsWith('/ranks')) result = ranks;
      else if (endpoint.endsWith('/rank-certificates')) result = mappings;
      else if (
        endpoint.endsWith('/rank-certificates/rank/1') &&
        request.method() === 'PUT'
      ) {
        const ids = request.postDataJSON().certificateIds;
        saves++;
        mappings = ids.map((id, i) => ({
          id: i + 1,
          rankId: 1,
          certificateId: id,
        }));
        result = { added: 1, removed: 0 };
      } else if (endpoint.endsWith('/voyages/next-number'))
        result = { voyageNumber: 'VN-2026-001' };
      else if (endpoint.endsWith('/ports'))
        result = {
          data: [
            { id: 1, portCode: 'VNSGN', portName: 'Sai Gon', isActive: true },
          ],
          pagination: {
            totalCount: 1,
            currentPage: 1,
            pageSize: 200,
            totalPages: 1,
          },
        };
      else if (endpoint.endsWith('/sync/notifications'))
        result = { notifications: [], unreadCount: 0 };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
    });
    await page.goto('http://127.0.0.1:3100/sync');
    await page.getByRole('heading', { name: 'Điều hành đồng bộ' }).waitFor();
    await page
      .getByRole('button', { name: 'Chi tiết', exact: true })
      .first()
      .waitFor();
    await page.screenshot({
      path: path.join(__dirname, 'shore-sync.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
    await page.getByText('30 bản ghi · Trang 2/2', { exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Chi tiết', exact: true })
      .first()
      .click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page
      .locator('.sync-filters label')
      .filter({ hasText: /^Trạng thái/ })
      .locator('select')
      .selectOption('CONFLICT');
    await page.getByText('10 bản ghi · Trang 1/1', { exact: true }).waitFor();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV trang này' }).click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /sync-logs-page-1.csv/);
    await page.getByRole('button', { name: /Hàng chờ \(3\)/ }).click();
    await page.getByText('Mọi tàu (broadcast)').first().waitFor();
    await page
      .getByRole('button', { name: 'Tạo hàng chờ gửi xuống', exact: true })
      .click();
    await page.screenshot({
      path: path.join(__dirname, 'shore-sync-confirm.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(__dirname, 'shore-sync-mobile.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      'Sync layout overflows mobile viewport',
    );
    await page.setViewportSize({ width: 1536, height: 900 });
    await page.goto('http://127.0.0.1:3100/categories?tab=certificate-types');
    await page
      .getByRole('heading', { name: 'Loại chứng chỉ', exact: true })
      .waitFor();
    await page.getByText('Cục hàng hải', { exact: true }).waitFor();
    const authorityWidth = await page
      .locator('.certificate-catalog-table col')
      .nth(2)
      .evaluate((e) => e.getBoundingClientRect().width);
    assert(
      authorityWidth > 120,
      `Authority column too narrow: ${authorityWidth}`,
    );
    await page.screenshot({
      path: path.join(__dirname, 'certificate-catalog.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Chứng chỉ theo chức danh', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Chỉnh yêu cầu', exact: true })
      .click();
    await page.getByLabel(/Basic Safety Training/).check();
    await page.screenshot({
      path: path.join(__dirname, 'rank-requirements.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Lưu yêu cầu', exact: true })
      .click();
    await page.getByText('2 chứng chỉ', { exact: true }).waitFor();
    assert.equal(saves, 1, 'Rank requirements did not save');
    await page.goto('http://127.0.0.1:3102/voyage');
    await page
      .getByRole('button', {
        name: /New Voyage|Hải trình mới|Chuyến đi mới|Tạo chuyến đi/,
      })
      .waitFor();
    await page
      .getByRole('button', {
        name: /New Voyage|Hải trình mới|Chuyến đi mới|Tạo chuyến đi/,
      })
      .click();
    await page.getByRole('dialog').waitFor();
    await page.locator('input[value="VN-2026-001"]').waitFor();
    assert.equal(
      await page
        .getByRole('dialog')
        .getByText('voyage.page.cargoWeightMT')
        .count(),
      0,
    );
    await page.screenshot({
      path: path.join(__dirname, 'create-voyage.png'),
      fullPage: true,
    });
    const footerBefore = await page
      .locator('.voyage-form-footer')
      .boundingBox();
    await page
      .locator('.voyage-form-body')
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    const footerAfter = await page.locator('.voyage-form-footer').boundingBox();
    assert.equal(
      footerAfter.y,
      footerBefore.y,
      'Voyage action footer moved while scrolling',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(__dirname, 'create-voyage-mobile.png'),
      fullPage: true,
    });
    const bounds = await page.getByRole('dialog').boundingBox();
    assert(
      bounds.x >= 0 && bounds.x + bounds.width <= 390,
      'Voyage dialog overflows mobile viewport',
    );
    assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
    console.log(
      'PASS: sync pagination, filter, detail, CSV, queue, mobile; certificate widths; rank requirements save; voyage translation, sticky footer and mobile layout. API responses mocked; no operational data changed.',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
