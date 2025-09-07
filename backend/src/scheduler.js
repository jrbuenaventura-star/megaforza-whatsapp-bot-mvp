// backend/src/scheduler.js
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

/* Utilidades de fecha */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function keyDay(d) {
  return startOfDay(d).toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function setHour(d, h) {
  const base = startOfDay(d);
  const hour = Number.isFinite(+h) ? +h : 8;
  base.setHours(hour, 0, 0, 0);
  return base;
}

/**
 * items: [{ product_id, qty_bags, pelletized }]
 * now: Date base
 * cfg: (opcional) objeto CapacityConfig ya leído (evita fetch extra)
 *
 * Retorna: { scheduled_at, ready_at, delivery_at }
 */
export async function scheduleOrderForItems(items = [], now = new Date(), cfg) {
  // 1) Totales del pedido
  let totalBags = 0;
  let pelletizedBags = 0;
  for (const it of items) {
    const qty = Number(it.qty_bags || 0);
    totalBags += qty;
    if (it.pelletized) pelletizedBags += qty;
  }

  // 2) Cargar capacidad (o defaults seguros)
  const capacity = cfg || (await prisma.capacityConfig.findUnique({ where: { id: 1 } }));
  const DAILY_TOTAL = Number(capacity?.daily_capacity_bags ?? 0) || 10000; // tope general
  const DAILY_PEL = Number(capacity?.daily_pelletized_capacity_bags ?? 0); // 0 = sin tope pelletizado
  const WORK_START = Number(capacity?.work_start_hour ?? 8);
  const WORK_END = Number(capacity?.work_end_hour ?? 17);

  // 3) Estados activos desde el enum real de Prisma
  const ACTIVE_STATUSES = (() => {
    const all = Object.values(Prisma.OrderStatus || {});
    // Fallback (por si no cargara el enum en algún entorno dev)
    if (!all.length) return ['paid', 'scheduled', 'in_production'];
    return all.filter((s) => s !== 'pending_payment' && s !== 'delivered');
  })();

  // 4) Traer órdenes activas próximas (una sola vez)
  const windowStart = startOfDay(now);
  const windowEnd = addDays(windowStart, 60); // horizonte de búsqueda

  const existing = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      scheduled_at: { gte: windowStart, lt: windowEnd },
    },
    include: { items: { include: { product: true } } },
    orderBy: { created_at: 'asc' },
  });

  // 5) Uso por día (total / pelletizado)
  const usage = new Map(); // key => { total, pel }
  for (const o of existing) {
    const k = keyDay(o.scheduled_at ?? o.created_at ?? windowStart);
    let t = 0;
    let p = 0;
    for (const it of o.items) {
      const qty = Number(it.qty_bags || 0);
      t += qty;
      if (it.product?.pelletized) p += qty;
    }
    const prev = usage.get(k) || { total: 0, pel: 0 };
    usage.set(k, { total: prev.total + t, pel: prev.pel + p });
  }

  // 6) Buscar el primer día que quepa
  let chosenDay = null;
  for (let offset = 0; offset < 60; offset++) {
    const day = addDays(windowStart, offset);
    const k = keyDay(day);
    const u = usage.get(k) || { total: 0, pel: 0 };

    const fitsTotal = u.total + totalBags <= DAILY_TOTAL;
    const fitsPel = DAILY_PEL <= 0 ? true : u.pel + pelletizedBags <= DAILY_PEL;

    if (fitsTotal && fitsPel) {
      chosenDay = day;
      // reserva “virtual” (por si llamas varias veces)
      usage.set(k, { total: u.total + totalBags, pel: u.pel + pelletizedBags });
      break;
    }
  }

  // 7) Horarios (mismo día de la agenda)
  const scheduledDay = chosenDay || addDays(windowStart, 1); // fallback: día siguiente
  const scheduled_at = setHour(scheduledDay, WORK_START);
  const ready_at = setHour(scheduledDay, WORK_END);
  const delivery_at = ready_at; // puedes cambiar a día siguiente si prefieres

  return { scheduled_at, ready_at, delivery_at };
}
