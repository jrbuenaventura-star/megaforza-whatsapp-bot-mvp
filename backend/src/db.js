// backend/src/db.js
import { PrismaClient } from '@prisma/client';

// Crea la instancia con logs útiles (puedes añadir 'query' si quieres ver SQL)
function createPrisma() {
  return new PrismaClient({
    log: ['warn', 'error'], // añade 'query' para depurar más
  });
}

// Reutiliza instancia en desarrollo para evitar fugas con hot-reload
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// En producción intenta conectar al arrancar y registra fallos
if (process.env.NODE_ENV === 'production') {
  prisma.$connect().catch((err) => {
    console.error('Prisma connect error:', err);
  });
}

// Cierre limpio (opcional)
process.on('beforeExit', async () => {
  try {
    await prisma.$disconnect();
  } catch (e) {
    // noop
  }
});

export default prisma;
