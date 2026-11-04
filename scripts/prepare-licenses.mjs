/** Collect upstream notices without changing their text or attributing project authorship. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const output = path.join(root, 'public', 'licenses');
const noticeName = /^(?:licen[cs]e|notice|copying|ofl)(?:[._ -]|$)/i;
const sections = [];
const manifest = [];

function collect(relative, recursive = false) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const location = path.posix.join(relative, entry.name);
    if (entry.isFile() && noticeName.test(entry.name)) {
      sections.push(`===== ${location} =====\n\n${fs.readFileSync(path.join(root, location), 'utf8').trimEnd()}\n`);
    } else if (recursive && entry.isDirectory()) collect(location, true);
  }
}

for (const [location, metadata] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  if (!location.startsWith('node_modules/')) continue;
  const packageFile = path.join(root, location, 'package.json');
  if (!fs.existsSync(packageFile)) continue; // Optional packages for other operating systems.
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? 'See upstream package');
  manifest.push(`${pkg.name}@${pkg.version} | ${license} | ${location}${metadata.dev ? ' | development' : ''}`);
  collect(location);
}

// Next bundles some dependencies inside its package rather than in npm's dependency tree.
collect('node_modules/next/dist/compiled', true);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'dependencies.txt'), [
  'THUNDER FANG — THIRD-PARTY DEPENDENCY NOTICES',
  '',
  'The project is authored by Gabriel Finzetto. The following notices apply only',
  'to the named dependencies. They do not identify coauthors of the project.',
  'Generated from package-lock.json and the locally installed npm packages.',
  'Optional native packages vary by operating system. npm preserves their notices',
  'in node_modules. Regenerate this file after updating dependencies: npm run licenses.',
  '',
  ...manifest,
  '',
  ...sections,
].join('\n'));

for (const [pkg, file] of [
  ['@fontsource-variable/inter', 'font-inter-OFL.txt'],
  ['@fontsource/archivo-black', 'font-archivo-black-OFL.txt'],
  ['@fontsource/noto-sans-sc', 'font-noto-sans-sc-OFL.txt'],
]) fs.copyFileSync(path.join(root, 'node_modules', pkg, 'LICENSE'), path.join(output, file));

console.log(`Preserved ${sections.length} notice files from ${manifest.length} installed packages and bundled dependencies.`);
