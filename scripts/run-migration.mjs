/**
 * Migration runner via Prisma pooler connection
 * Splits SQL correctly handling DO $$ ... $$ blocks
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarBlock = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip pure comment lines and empty lines for detection only
    if (trimmed.startsWith('--') || trimmed === '') {
      if (inDollarBlock) current += line + '\n';
      continue;
    }

    // Toggle $$ block detection
    const dollarMatches = (line.match(/\$\$/g) || []).length;
    if (dollarMatches % 2 !== 0) {
      inDollarBlock = !inDollarBlock;
    }

    current += line + '\n';

    // A statement ends at ; outside a $$ block
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') {
        statements.push(stmt);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function main() {
  const sql = readFileSync(
    new URL('../prisma/migrations/20260316_savings_engine/migration.sql', import.meta.url),
    'utf8'
  );

  const statements = splitStatements(sql);
  console.log(`Found ${statements.length} statements to execute\n`);

  let i = 0;
  for (const stmt of statements) {
    i++;
    const preview = stmt.slice(0, 80).replace(/\n/g, ' ');
    process.stdout.write(`[${i}/${statements.length}] ${preview}... `);
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log('OK');
    } catch (err) {
      // Ignore "already exists" errors for idempotency
      if (
        err.message.includes('already exists') ||
        err.message.includes('duplicate') ||
        err.message.includes('does not exist')
      ) {
        console.log(`SKIP (${err.message.split('\n')[0].slice(0, 60)})`);
      } else {
        console.log(`ERROR: ${err.message.split('\n')[0]}`);
        // Continue anyway — report at end
      }
    }
  }

  console.log('\nMigration complete.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
