import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Verifies active database connectivity.
 * Returns { connected: boolean, latencyMs?: number, error?: string }
 */
export async function checkDbConnection() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return { connected: true, latencyMs };
  } catch (error) {
    return {
      connected: false,
      error: error.message || 'Database connection failed'
    };
  }
}

/**
 * Graceful database disconnect
 */
export async function disconnectDb() {
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error disconnecting from database:', err);
  }
}

