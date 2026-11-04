/** Verify exact configured server secrets without displaying or persisting their values. */
import nextEnv from '@next/env';
import fs from 'node:fs';
import path from 'node:path';

nextEnv.loadEnvConfig(process.cwd());
const root = process.cwd();
const keyNames = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'BACKEND_REVIEW_SECRET'];
const secrets = keyNames.flatMap(name => {
  const value = process.env[name];
  return value && value.length >= 16 ? [{ name, bytes: Buffer.from(value) }] : [];
});
const report = { configuredServerSecretsChecked: secrets.length, filesChecked: 0, publicBuildChecked: fs.existsSync('.next/static'), findings: [], passed: false };
const roots = ['src', 'public', 'docs', 'scripts', 'supabase', 'tests', '.next/static'];
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.sql', '.html', '.css', '.svg']);

function scan(file, textOnly = false) {
  const item = fs.statSync(file);
  if (item.isDirectory()) {
    for (const entry of fs.readdirSync(file)) scan(path.join(file, entry), textOnly);
    return;
  }
  if (!item.isFile() || (textOnly && !textExtensions.has(path.extname(file)))) return;
  const data = fs.readFileSync(file);
  report.filesChecked += 1;
  for (const secret of secrets) if (data.includes(secret.bytes)) report.findings.push({ file: path.relative(root, file), variable: secret.name });
}

try {
  for (const directory of roots) if (fs.existsSync(directory)) scan(directory);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && (!entry.name.startsWith('.env') || entry.name === '.env.example')) scan(entry.name);
  }
  if (fs.existsSync('test-results')) scan('test-results', true);
  report.passed = report.publicBuildChecked && secrets.length > 0 && report.findings.length === 0;
  fs.mkdirSync('test-results/security', { recursive: true });
  fs.writeFileSync('test-results/security/secret-boundaries-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} catch {
  console.error('Secret-boundary verification could not complete. No secret values were emitted.');
  process.exitCode = 1;
}
