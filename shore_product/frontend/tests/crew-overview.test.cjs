const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/crewOverview.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(output, context);
const { findVesselCaptain } = context.exports;

test('real crew DTO with nested rank objects before the captain does not throw', () => {
  assert.equal(findVesselCaptain([
    { fullName: 'Máy hai', rank: { rankCode: '2/E', rankName: 'Máy hai' } },
    { fullName: 'Nguyễn Văn An', rankCode: 'CAPT', rankName: 'Thuyền trưởng', rank: { rankCode: 'CAPT' } },
  ]), 'Nguyễn Văn An');
});
test('supports nested rank, localized name and English rank', () => {
  for (const role of [{ rank: { rankCode: 'CAPT' } }, { rankName: 'Thuyền trưởng' },
    { rankName: 'THUYEN TRUONG' }, { rankName: 'Master' }]) {
    assert.equal(findVesselCaptain([{ fullName: 'Captain', ...role }]), 'Captain');
  }
});
test('does not mistake bosun, chief officer or chief engineer for captain', () => {
  assert.equal(findVesselCaptain([{ rankName: 'Thủy thủ trưởng' }, { rankCode: 'C/O' },
    { rankName: 'Máy trưởng' }, { rank: null }]), undefined);
  assert.equal(findVesselCaptain([]), undefined);
});
