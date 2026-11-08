const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/components/common/SmsPdfPreview.tsx');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const component = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(sourcePath), component, component.exports);
const { pdfPreviewUrl, loadPreviewPdf } = component.exports;
global.window = { location: { origin: 'https://shore.example.test' } };

test('relative paths encode Vietnamese filenames exactly once', () => {
  const encoded = 'https://shore.example.test/uploads/sms/B%E1%BA%A3o%20tr%C3%AC.pdf';
  assert.equal(pdfPreviewUrl('/uploads/sms/Bảo trì.pdf'), encoded);
  assert.equal(pdfPreviewUrl('/uploads/sms/B%E1%BA%A3o%20tr%C3%AC.pdf#toolbar=0'), encoded);
  assert.equal(pdfPreviewUrl('\\uploads\\sms\\test.pdf'), 'https://shore.example.test/uploads/sms/test.pdf');
});

test('rejects executable URLs', () => {
  assert.throws(() => pdfPreviewUrl('javascript:alert(1)'), /không hợp lệ/);
});

test('loads PDF bytes using a cancellable request', async t => {
  const signal = new AbortController().signal;
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://shore.example.test/uploads/sms/test.pdf');
    assert.equal(options.signal, signal);
    return new Response('%PDF-1.7\n', { headers: { 'Content-Type': 'application/pdf' } });
  });
  assert.equal(await (await loadPreviewPdf('/uploads/sms/test.pdf', signal)).text(), '%PDF-1.7\n');
});

for (const status of [525, 526, 404, 503]) {
  test(`HTTP ${status} produces a readable error instead of embedding HTML`, async t => {
    t.mock.method(global, 'fetch', async () => new Response('<html>Cloudflare error</html>', { status }));
    await assert.rejects(loadPreviewPdf('/uploads/sms/test.pdf', new AbortController().signal),
      status === 404 ? /Không tìm thấy/ : status >= 525 ? /HTTPS/ : /HTTP 503/);
  });
}

test('rejects HTML even when the proxy returns HTTP 200', async t => {
  t.mock.method(global, 'fetch', async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(loadPreviewPdf('/uploads/sms/test.pdf', new AbortController().signal), /không phải PDF/);
});

test('rejects a non-PDF body mislabeled as PDF', async t => {
  t.mock.method(global, 'fetch', async () => new Response('<html>Error</html>', { headers: { 'Content-Type': 'application/pdf' } }));
  await assert.rejects(loadPreviewPdf('/uploads/sms/test.pdf', new AbortController().signal), /không phải PDF/);
});
