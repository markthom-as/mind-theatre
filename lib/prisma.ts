import { PrismaClient } from '../node_modules/.prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-unused-vars
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
  // log: ['query', 'info', 'warn', 'error'], // Uncomment to see Prisma logs
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma; 