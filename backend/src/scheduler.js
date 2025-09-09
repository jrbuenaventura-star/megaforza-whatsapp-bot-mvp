// backend/src/scheduler.js
import { prisma } from "./db.js";
import { OrderStatus } from '@prisma/client';

/* ===================== helpers de fechas ===================== */
function ymdPartsInTZ(date, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")) };
}
function dateAtLocalTime(tz, date, hour=9, minute=0, second=0) {
  const { y, m, d } = ymdPartsInTZ(date, tz);
  return new Date(Date.UTC(y, m-1, d, hour, minute, second));
}
function startOfDayTZ(tz, date = new Date()) { return dateAtLocalTime(tz, date, 0,0,0); }
function addDays(date, days) { const d = new Date(date); d.setUTCDate(d.getUTCDate()+days); return d; }
function keyYYYYMMDD(tz, date) {
  const { y, m, d } = ymdPartsInTZ(date, tz);
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

/* ===================== normaliza config ===================== */
function normalizeCfg(cfg = {}) {
  return {
    daily_capacity_pelletized: Number(cfg.daily_capacity_pelletized ?? 0),
    daily_capacity_normal: Number(cfg.daily_capacity_normal ?? 0),
    horizon_days: Number(cfg.horizon_days ?? 60),
    ready_hours: Number(cfg.ready_hours ?? 17),
    delivery_next_day_hour: Number(cfg.delivery_next_day_hour ?? 14),
  };
}

/**
 * enrichedItems: [{ qty_bags:number, pelletized:boolean }]
 * Devuelve { scheduled_at, ready_at, delivery_at }
 */
export async function scheduleOrderForItems(enrichedItems, now = new Date(), rawCfg) {
  const TZ = "America/Bogota";
  const cfg = normalizeCfg(rawCfg);

  // 1) Ventana (hoy → hoy + horizonte)
  const start = startOfDayTZ(TZ, now);
  const end   = addDays(start, cfg.horizon_days);

  // 2) Trae órdenes ya agendadas en esa ventana (¡sin filtro por status!)
  const existing = await prisma.order.findMany({
    where: {
    status: { in: [OrderStatus.PAID, OrderStatus.SCHEDULED, OrderStatus.IN_PRODUCTION] },
    scheduled_at: {
      gte: new Date('2025-09-09T05:00:00.000Z'),
      lt:  new Date('2025-11-08T05:00:00.000Z'),
    },
  },
  include: { items: { include: { product: true } } },
  orderBy: { created_at: 'asc' },
});

  // 3) Arma carga por día
  const capacityMap = new Map(); // key -> { pelletized, normal }
  const ensureDay = (k) => {
    if (!capacityMap.has(k)) capacityMap.set(k, { pelletized: 0, normal: 0 });
    return capacityMap.get(k);
  };

  for (const o of existing) {
    if (!o.scheduled_at) continue;
    const dayKey = keyYYYYMMDD(TZ, o.scheduled_at);
    const bucket = ensureDay(dayKey);
    for (const it of o.items) {
      const qty = Number(it.qty_bags || 0);
      const isPel = !!it.product?.pelletized;
      if (isPel) bucket.pelletized += qty;
      else bucket.normal += qty;
    }
  }

  // 4) Suma del pedido nuevo
  let needPel = 0, needNorm = 0;
  for (const it of enrichedItems) {
    const qty = Number(it.qty_bags || 0);
    if (it.pelletized) needPel += qty;
    else needNorm += qty;
  }

  // 5) Encuentra el primer día con cupo
  let chosen = start;
  for (let i = 0; i < cfg.horizon_days; i++) {
    const day = addDays(start, i);
    const key = keyYYYYMMDD(TZ, day);
    const bucket = ensureDay(key);

    const capPel = cfg.daily_capacity_pelletized;
    const capNor = cfg.daily_capacity_normal;

    const okPel = (needPel === 0) || (bucket.pelletized + needPel <= capPel);
    const okNor = (needNorm === 0) || (bucket.normal + needNorm <= capNor);

    if (okPel && okNor) {
      chosen = day;
      // pre-reserva en memoria
      bucket.pelletized += needPel;
      bucket.normal += needNorm;
      break;
    }
  }

  // 6) Fechas finales
  const scheduled_at = dateAtLocalTime(TZ, chosen, 9, 0, 0);
  const ready_at     = dateAtLocalTime(TZ, chosen, cfg.ready_hours, 0, 0);
  const delivery_at  = dateAtLocalTime(TZ, addDays(chosen, 1), cfg.delivery_next_day_hour, 0, 0);

  return { scheduled_at, ready_at, delivery_at };
}
