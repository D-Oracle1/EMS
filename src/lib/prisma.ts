import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: appendConnectionParams(process.env.DATABASE_URL || ''),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Append connection pool parameters for serverless environments.
 * Limits pool size and adds connect/pool timeouts to prevent connection exhaustion.
 */
function appendConnectionParams(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    // Limit connection pool for serverless (default 10 is too high)
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '5');
    }
    // Connection timeout: how long to wait for a free connection from the pool
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '10');
    }
    // Connect timeout: how long to wait when opening a new connection to the DB
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '10');
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails (e.g., non-standard format), return as-is
    return url;
  }
}

// Transient Prisma error codes that are safe to retry
const RETRYABLE_ERROR_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
]);

/**
 * Execute a Prisma operation with automatic retry for transient failures.
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 200
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true; // Connection init failures are always retryable
  }
  // Catch generic connection reset / socket hang up errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('connection reset') ||
      msg.includes('socket hang up') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    );
  }
  return false;
}

/**
 * Execute operations within a Prisma interactive transaction.
 * Includes sensible timeouts for serverless environments.
 */
export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 10000,
    timeout: 30000,
  });
}

/**
 * Graceful shutdown — disconnect Prisma on process termination.
 * Prevents connection leaks when the serverless function container is recycled.
 */
if (typeof process !== 'undefined') {
  const shutdown = async () => {
    await prisma.$disconnect();
  };
  process.on('beforeExit', shutdown);
}
