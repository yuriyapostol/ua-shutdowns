const { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } = require('node:fs');
const { resolve, join, dirname, relative, isAbsolute, sep } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const dependency = 'qrcode-generator';
const repository = 'https://github.com/yuriyapostol/qrcode-generator';
const entrypoints = ['core/qrcode.mjs', 'encodings/utf8.mjs', 'renderers/svg.mjs'];
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

function expectedVendorFiles(root = projectRoot) {
  const manifest = readJson(join(root, 'package.json'));
  const lock = readJson(join(root, 'package-lock.json'));
  const spec = manifest.dependencies?.[dependency];
  const tag = /^github:yuriyapostol\/qrcode-generator#(v\d+\.\d+\.\d+)$/.exec(spec || '')?.[1];
  if (!tag) throw new Error('Pin qrcode-generator to an exact version tag, e.g. github:yuriyapostol/qrcode-generator#v3.4.0.');
  const locked = lock.packages?.['node_modules/' + dependency];
  // npm resolves a GitHub tag to an immutable commit in the lockfile.
  const commit = /^git\+(?:https:\/\/|ssh:\/\/git@)github\.com\/yuriyapostol\/qrcode-generator\.git#([a-f0-9]{40})$/.exec(locked?.resolved || '')?.[1];
  if (lock.packages?.['']?.dependencies?.[dependency] !== spec || !commit || locked.version !== tag.slice(1)) {
    throw new Error('The QR dependency tag and package-lock.json disagree. Run npm install --ignore-scripts.');
  }
  const sourceRoot = join(root, 'node_modules', dependency);
  if (!existsSync(join(sourceRoot, 'package.json'))) throw new Error('QR dependency is missing. Run npm ci --ignore-scripts first.');
  const installed = readJson(join(sourceRoot, 'package.json'));
  if (installed.name !== dependency || installed.version !== locked.version || installed.license !== 'MIT') {
    throw new Error('Unexpected QR package version or license. Reinstall from the lockfile and review upstream licensing if it changed.');
  }
  const dist = join(sourceRoot, 'dist');
  const files = new Map();
  function addModule(filename) {
    const key = relative(dist, filename).split(sep).join('/');
    if (key.startsWith('../') || isAbsolute(key) || !key.endsWith('.mjs')) throw new Error('QR module is outside dist/: ' + filename);
    if (files.has(key)) return;
    const content = readFileSync(filename);
    files.set(key, content);
    // Follow static ES module dependencies; only relative modules can be shipped directly.
    for (const match of content.toString().matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) throw new Error('QR module requires an external import: ' + match[1]);
      addModule(resolve(dirname(filename), match[1]));
    }
  }
  for (const entrypoint of entrypoints) addModule(join(dist, entrypoint));
  const upstreamLicense = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'].find(name => existsSync(join(sourceRoot, name)));
  // Version 3.4.0 declares MIT but has no standalone license file.
  const licenseSource = upstreamLicense ? join(sourceRoot, upstreamLicense) : join(root, 'scripts/licenses/qrcode-generator.txt');
  files.set('LICENSE', readFileSync(licenseSource));
  files.set('README.md', Buffer.from(`# qrcode-generator\n\n` +
    `Local modules from [yuriyapostol/qrcode-generator ${tag}](${repository}/tree/${tag}).\n\n` +
    `Source commit: \`${commit}\` (resolved in \`package-lock.json\`).\n\n` +
    `Generated with \`npm run vendor:sync\`: core, UTF-8 encoding, SVG renderer and their relative imports.\n\n` +
    `License: ${installed.license}. See [LICENSE](LICENSE).\n`));
  return files;
}

function vendorFiles(directory, prefix = '') {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const key = prefix + entry.name;
    if (entry.isDirectory()) return vendorFiles(join(directory, entry.name), key + '/');
    if (!entry.isFile()) throw new Error('Unexpected non-file in vendor/: ' + key);
    return [key];
  });
}
function vendorQrcode(mode, root = projectRoot) {
  if (!['sync', 'check'].includes(mode)) throw new Error('Usage: node scripts/vendor-qrcode.cjs <sync|check>');
  // Read and validate every source before modifying the committed vendor copy.
  const expected = expectedVendorFiles(root);
  const destination = join(root, 'vendor', dependency);
  const current = vendorFiles(destination);
  const different = [...expected].filter(([key, content]) =>
    !existsSync(join(destination, key)) || !readFileSync(join(destination, key)).equals(content)).map(([key]) => key);
  const extra = current.filter(key => !expected.has(key));
  if (mode === 'check') {
    if (different.length || extra.length) throw new Error('QR vendor files differ from the locked dependency: ' +
      [...different, ...extra.map(key => key + ' (unexpected)')].join(', ') + '. Run npm run vendor:sync and commit the result.');
  } else {
    for (const [key, content] of expected) {
      mkdirSync(dirname(join(destination, key)), { recursive: true });
      writeFileSync(join(destination, key), content);
    }
    for (const key of extra) rmSync(join(destination, key));
  }
  return expected.size;
}
if (require.main === module) {
  try {
    const count = vendorQrcode(process.argv[2]);
    console.log(`${process.argv[2] === 'sync' ? 'Synchronized' : 'Verified'} ${count} QR vendor files.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { expectedVendorFiles, vendorQrcode };
