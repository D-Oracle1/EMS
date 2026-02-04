import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger.js';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma error', { error: e.message });
});

export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 10000,
    timeout: 30000,
  });
}

export default prisma;
