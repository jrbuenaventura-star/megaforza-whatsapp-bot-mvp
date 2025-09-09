// backend/src/scheduler.js
import { prisma } from "./db.js";

/**
 * Helpers de fecha en zona horaria específica
 */
function ymdPartsInTZ(date, tz) {
  // extrae YYYY, MM, DD en la zona indicada
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
  };
}
function dateAtLocalTime(tz, date, hour = 9, minute = 0, second = 0) {
  // Crea un Date UTC que representa (YYYY-MM-DD hh:mm:ss) en la TZ dada
  const { y, m, d } = ymdPartsInTZ(date, tz);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, second));
}
function startOfDayTZ(tz, date = new Date()) {
  return dateAtLocalTime(tz, date, 0, 0, 0);
}
function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function keyYYYYMMDD(tz, date) {
  const { y, m, d } = ymdPartsInTZ(date, tz);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Regresa statuses "activos" existentes en BD, mapeados a su forma real.
 * Evita hardcodear el enum de Prisma para no romper si cambia.
 */
async function getActiveStatusesOrEmpty() {
  const desired = ["paid", "scheduled", "in_production"];
  try {
    const rows = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const existing = rows.map(r => r.status);
    // Mantén únicamente los que coincidan por lowercase con nuestra lista
    const matched = existing.filter(s => desired.includes(String(s).toLowerCase()));
    return matched; // valores exactos (tal como están en la BD/enum)
  } catch {
    // Si groupBy no funciona (p.ej. motor no soporta), devolvemos vacío
    return [];
  }
}

/**
 * Estructura esperada de cfg (capacityConfig):
 * - daily_capacity_pelletized (número)
 * - daily_capacity_normal (número)
 * - horizon_days (opcional, por defecto 60)
 * - ready_hours (opcional, hora de "ready_at", por defecto 17)
 * - delivery_next_day_hour (opcional, hora de entrega del día siguiente, por defecto 14)
 */
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
 * enrichedItems: [{ qty_bags: number, pelletized: boolean }]
 */
export async function scheduleOrderForItems(enrichedItems, now = new Date(), rawCfg) {
  const TZ = "America/Bogota";
  const cfg = normalizeCfg(rawCfg);

  // 1) Ventana de búsqueda (hoy -> hoy + horizon)
  const start = startOfDayTZ(TZ, now); // 00:00 local de hoy
  const end = addDays(start, cfg.horizon_days); // fin del horizonte

  // 2) Construye filtro where robusto (evita romper con enum)
  const where = {
    scheduled_at: { gte: start, lt: end },
  };
  const activeStatuses = await getActiveStatusesOrEmpty();
  if (activeStatuses.length > 0) {
    // Solo si existen en BD, filtramos por ellos
    where.status = { in: activeStatuses };
  }
  // Si no hay 'in', Prisma no valida contra enum y no rompe.

  // 3) Trae órdenes existentes en la ventana (con items y sus productos)
  const existing = await prisma.order.findMany({
    where,
    include: {
      items: { include: { product: true } },
    },
    orderBy: { created_at: "asc" },
  });

  // 4) Arma carga por día (pelletizado / normal)
  //    capacityMap[yyyy-mm-dd] = { pelletized: n, normal: n }
  const capacityMap = new Map();
  function ensureDay(key) {
    if (!capacityMap.has(key)) capacityMap.set(key, { pelletized: 0, normal: 0 });
    return capacityMap.get(key);
  }

  for (const o of existing) {
    // si scheduled_at es null, ignóralo
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

  // 5) Suma del pedido nuevo
  let needPel = 0;
  let needNorm = 0;
  for (const it of enrichedItems) {
    const qty = Number(it.qty_bags || 0);
    if (it.pelletized) needPel += qty;
    else needNorm += qty;
  }

  // 6) Busca el primer día con cupo
  let chosenDate = start;
  for (let i = 0; i < cfg.horizon_days; i++) {
    const day = addDays(start, i);
    const dayKey = keyYYYYMMDD(TZ, day);
    const bucket = ensureDay(dayKey);

    const capPel = cfg.daily_capacity_pelletized;
    const capNor = cfg.daily_capacity_normal;

    const hasPelletRoom = (needPel === 0) || (bucket.pelletized + needPel <= capPel);
    const hasNormRoom = (needNorm === 0) || (bucket.normal + needNorm <= capNor);

    if (hasPelletRoom && hasNormRoom) {
      chosenDate = day;
      // "pre-reserva" (no es DB, solo para cálculo)
      bucket.pelletized += needPel;
      bucket.normal += needNorm;
      break;
    }
  }

  // 7) Arma fechas de respuesta (horas habituales de planta/entrega)
  const scheduled_at = dateAtLocalTime(TZ, chosenDate, 9, 0, 0); // 09:00 local
  const ready_at = dateAtLocalTime(TZ, chosenDate, cfg.ready_hours, 0, 0); // 17:00 local por defecto
  const delivery_at = dateAtLocalTime(TZ, addDays(chosenDate, 1), cfg.delivery_next_day_hour, 0, 0); // día siguiente 14:00 local

  return { scheduled_at, ready_at, delivery_at };
}
