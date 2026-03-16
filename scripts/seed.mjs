/**
 * Cross-platform seed runner.
 * Reads DIRECT_URL from .env and passes it as DATABASE_URL so Prisma
 * uses the direct Supabase connection (port 5432) instead of the
 * pgbouncer pooler (port 6543), which cannot handle seed transactions.
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const envPath = resolve(root, '.env');

if (!existsSync(envPath)) {
  console.error('ERROR: .env file not found at', envPath);
  process.exit(1);
}

const envContent = readFileSync(envPath, 'utf8');

function getEnvVar(content, key) {
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

const directUrl = getEnvVar(envContent, 'DIRECT_URL');

if (!directUrl) {
  console.error('ERROR: DIRECT_URL not found in .env');
  console.error('Add DIRECT_URL=postgresql://... (port 5432) to your .env file');
  process.exit(1);
}

console.log('Using direct DB connection for seed (bypassing pgbouncer)...\n');

execSync('npx prisma db seed', {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: directUrl,
  },
});
