import { PrismaClient } from '../../../prisma/generated/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const createPrismaClient = () => {
  const dbUrl = process.env.LOOP_ENGINEERING_DB
    ? `file:${process.env.LOOP_ENGINEERING_DB}`
    : 'file:./dev.db';
  const adapter = new PrismaBetterSqlite3({
    url: dbUrl,
  });
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;