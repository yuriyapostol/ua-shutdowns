const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { expectedVendorFiles, vendorQrcode } = require('../scripts/vendor-qrcode.cjs');

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'ua-shutdowns-vendor-'));
  const write = (file, value) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), typeof value === 'object' ? JSON.stringify(value) : value);
  };
  const spec = 'github:yuriyapostol/qrcode-generator#v3.4.0';
  const lock = { packages: { '': { dependencies: { 'qrcode-generator': spec } },
    'node_modules/qrcode-generator': { version: '3.4.0', resolved: 'git+https://github.com/yuriyapostol/qrcode-generator.git#' + '1'.repeat(40) } } };
  write('package.json', { dependencies: { 'qrcode-generator': spec } });
  write('package-lock.json', lock);
  write('node_modules/qrcode-generator/package.json', { name: 'qrcode-generator', version: '3.4.0', license: 'MIT' });
  write('node_modules/qrcode-generator/dist/core/qrcode.mjs', 'export default {};\n');
  write('node_modules/qrcode-generator/dist/encodings/utf8.mjs', "import qr from '../core/qrcode.mjs';\n");
  write('node_modules/qrcode-generator/dist/renderers/svg.mjs', "import { escape } from './utils/xml.mjs';\n");
  write('node_modules/qrcode-generator/dist/renderers/utils/xml.mjs', 'export const escape = String;\n');
  write('scripts/licenses/qrcode-generator.txt', 'Original MIT license notice\n');
  try { return run({ root, write, lock }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('sync copies only entrypoints, relative imports, license and provenance with exact bytes', () => fixture(({ root, write }) => {
  write('node_modules/qrcode-generator/dist/renderers/png.mjs', 'not needed');
  assert.equal(vendorQrcode('sync', root), 6);
  assert.equal(vendorQrcode('check', root), 6);
  for (const [name, expected] of expectedVendorFiles(root)) {
    assert.deepEqual(readFileSync(join(root, 'vendor/qrcode-generator', name)), expected);
  }
  assert.equal(existsSync(join(root, 'vendor/qrcode-generator/renderers/png.mjs')), false);
  const readme = readFileSync(join(root, 'vendor/qrcode-generator/README.md'), 'utf8');
  assert.match(readme, /qrcode-generator v3\.4\.0/);
  assert.ok(readme.includes('1'.repeat(40)));
  assert.match(readme, /License: MIT/);
}));

test('check detects drift without changing files; sync repairs drift and removes obsolete modules', () => fixture(({ root, write }) => {
  vendorQrcode('sync', root);
  write('vendor/qrcode-generator/core/qrcode.mjs', 'local change');
  write('vendor/qrcode-generator/old.mjs', 'obsolete module');
  assert.throws(() => vendorQrcode('check', root), /core\/qrcode.mjs.*old.mjs/);
  assert.equal(readFileSync(join(root, 'vendor/qrcode-generator/core/qrcode.mjs'), 'utf8'), 'local change');
  vendorQrcode('sync', root);
  vendorQrcode('check', root);
  assert.equal(existsSync(join(root, 'vendor/qrcode-generator/old.mjs')), false);
}));

test('invalid or mismatched pins and package versions fail before changing vendor files', () => fixture(({ root, write, lock }) => {
  vendorQrcode('sync', root);
  const original = readFileSync(join(root, 'vendor/qrcode-generator/core/qrcode.mjs'));
  lock.packages[''].dependencies['qrcode-generator'] = 'github:yuriyapostol/qrcode-generator#v3.5.0';
  write('package-lock.json', lock);
  assert.throws(() => vendorQrcode('sync', root), /disagree/);
  assert.deepEqual(readFileSync(join(root, 'vendor/qrcode-generator/core/qrcode.mjs')), original);
  write('package.json', { dependencies: { 'qrcode-generator': 'github:yuriyapostol/qrcode-generator#main' } });
  assert.throws(() => vendorQrcode('sync', root), /exact version tag/);
}));

test('npm GitHub URL normalization is accepted only for the pinned repository and commit', () => fixture(({ root, write, lock }) => {
  lock.packages['node_modules/qrcode-generator'].resolved = 'git+ssh://git@github.com/yuriyapostol/qrcode-generator.git#' + '1'.repeat(40);
  write('package-lock.json', lock);
  vendorQrcode('sync', root);
  vendorQrcode('check', root);
  write('node_modules/qrcode-generator/package.json', { name: 'qrcode-generator', version: '9.0.0', license: 'MIT' });
  assert.throws(() => vendorQrcode('sync', root), /Unexpected QR package/);
}));

test('upstream license files are copied when available', () => fixture(({ root, write }) => {
  write('node_modules/qrcode-generator/LICENSE', 'Upstream MIT notice\n');
  vendorQrcode('sync', root);
  assert.equal(readFileSync(join(root, 'vendor/qrcode-generator/LICENSE'), 'utf8'), 'Upstream MIT notice\n');
  assert.match(readFileSync(join(root, 'vendor/qrcode-generator/README.md'), 'utf8'), /License: MIT/);
}));

test('missing or external imports stop synchronization before overwriting the existing vendor copy', () => fixture(({ root, write }) => {
  vendorQrcode('sync', root);
  write('node_modules/qrcode-generator/dist/renderers/svg.mjs', "import 'missing-external-package';\n");
  assert.throws(() => vendorQrcode('sync', root), /external import/);
  assert.match(readFileSync(join(root, 'vendor/qrcode-generator/renderers/svg.mjs'), 'utf8'), /utils\/xml/);
  write('node_modules/qrcode-generator/dist/renderers/svg.mjs', "import './missing.mjs';\n");
  assert.throws(() => vendorQrcode('sync', root), /ENOENT/);
}));

test('vendored modules generate UTF-8 SVG QR codes through the extension sharing API', async () => {
  const { scheduleQrSvg } = await import('../schedule-sharing.mjs');
  const svg = scheduleQrSvg('Графік відключень: 02:30–13:00', { title: 'Schedule <test>', alt: 'Scan & read' });
  assert.match(svg, /<svg\b/);
  assert.match(svg, /<path\b/);
  assert.match(svg, /Schedule &lt;test&gt;/);
  assert.match(svg, /Scan &amp; read/);
});
