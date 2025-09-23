// backend/src/scheduler.js
import { DateTime } from "luxon";
import { prisma } from "./db.js";
import { Prisma, OrderStatus } from "@prisma/client";

// ───────────────── estados (canónico ↔ BD) ─────────────────
const CANON = {
  PENDING: "pending_payment",
  PAID: "paid",
  PROC: "processing",
  INPROD: "in_production",
  READY: "ready", // mapea a scheduled si tu enum no lo trae
  SCHEDULED: "scheduled",
  DELIV: "delivered",
  CANC: "canceled",
};

// ¿Existe el valor en el enum de Prisma (clave o valor)?
const _statusEnum = (Prisma?.OrderStatus ?? OrderStatus ?? {});
const _keys = Object.keys(_statusEnum);
const _vals = Object.values(_statusEnum);
const _has = (v) => _keys.includes(v) || _vals.includes(v);
const _asEnum = (v) => _statusEnum[v] ?? v;

/**
 * Estados que cuentan para el backlog de producción:
 * - pending_payment, paid, in_production (o processing)
 * Fuera del backlog: scheduled/ready, delivered, canceled.
 */
export function backlogStatusesForDb() {
  const out = [];
  if (_has(CANON.PENDING)) out.push(_asEnum(CANON.PENDING));
  if (_has(CANON.PAID)) out.push(_asEnum(CANON.PAID));
  if (_has(CANON.INPROD)) out.push(_asEnum(CANON.INPROD));
  else if (_has(CANON.PROC)) out.push(_asEnum(CANON.PROC));
  return out;
}

/* ───────────────────────── util de días hábiles ───────────────────────── */

function isWorkdayLuxon(dt, workdaysStr = "Mon,Tue,Wed,Thu,Fri,Sat") {
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const set = new Set(
    (workdaysStr || "Mon,Tue,Wed,Thu,Fri,Sat").split(",").map((w) => map[w.trim()])
  );
  return set.has(dt.weekday);
}

function parseHHmm(hhmm = "00:00") {
  const [h, m] = String(hhmm).split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

/**
 * Devuelve una “vista efectiva” del config para una fecha dada.
 * Si es sábado y existen campos sat_*, los usa; si no, toma los default.
 */
function effectiveCfgFor(jsDate, cfg) {
  const tz = cfg?.timezone || "America/Bogota";
  const token = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(jsDate);
  const isSat = token === "Sat";

  const pick = (satKey, defKey) => {
    const satVal = cfg?.[satKey];
    return isSat && satVal != null && satVal !== "" ? satVal : cfg?.[defKey];
  };

  return {
    timezone: tz,
    workdays: cfg?.workdays || "Mon,Tue,Wed,Thu,Fri,Sat",
    dispatch_buffer_min: Number(cfg?.dispatch_buffer_min || 60),

    // capacidades
    pellet_bph: Number(pick("sat_pellet_bph", "pellet_bph") || 0),
    non_pellet_bph: Number(pick("sat_non_pellet_bph", "non_pellet_bph") || 0),

    // horario de ese día
    workday_start: pick("sat_workday_start", "workday_start") || "08:00",
    workday_end: pick("sat_workday_end", "workday_end") || "17:00",
  };
}

/* ─────────────────── jornada laboral y suma de horas ─────────────────── */

/**
 * Si dt está fuera de jornada, lo clampa al inicio de jornada de ese día.
 * Si ya pasó el fin de jornada, salta al siguiente día hábil al inicio.
 */
function clampToWorkStart(dt, cfgDay) {
  const { h: sh, m: sm } = parseHHmm(cfgDay.workday_start);
  const { h: eh, m: em } = parseHHmm(cfgDay.workday_end);

  const start = dt.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
  const end = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

  if (!isWorkdayLuxon(dt, cfgDay.workdays)) {
    // Siguiente día hábil al inicio
    let d = dt.plus({ days: 1 }).startOf("day");
    while (!isWorkdayLuxon(d, cfgDay.workdays)) d = d.plus({ days: 1 });
    const nextDayCfg = effectiveCfgFor(d.toJSDate(), { ...cfgDay });
    const { h: nSh, m: nSm } = parseHHmm(nextDayCfg.workday_start);
    return d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
  }

  if (dt < start) return start;
  if (dt >= end) {
    // Siguiente día hábil al inicio
    let d = dt.plus({ days: 1 }).startOf("day");
    while (!isWorkdayLuxon(d, cfgDay.workdays)) d = d.plus({ days: 1 });
    const nextDayCfg = effectiveCfgFor(d.toJSDate(), { ...cfgDay });
    const { h: nSh, m: nSm } = parseHHmm(nextDayCfg.workday_start);
    return d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
  }
  return dt;
}

/**
 * Suma horas de trabajo a partir de startDt respetando jornada y días hábiles.
 * Usa SIEMPRE el cfg efectivo del día que se está iterando.
 */
function addWorkHours(startDt, hours, cfg) {
  let remainingMin = Math.round((hours || 0) * 60);
  let dt = startDt;

  while (remainingMin > 0) {
    const dayCfg = effectiveCfgFor(dt.toJSDate(), cfg);
    dt = clampToWorkStart(dt, dayCfg);

    const { h: eh, m: em } = parseHHmm(dayCfg.workday_end);
    const end = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    const avail = Math.max(0, end.diff(dt, "minutes").minutes);

    if (avail <= 0) {
      // Pasar al inicio del siguiente día hábil
      let d = dt.plus({ days: 1 }).startOf("day");
      while (!isWorkdayLuxon(d, dayCfg.workdays)) d = d.plus({ days: 1 });
      const nextDayCfg = effectiveCfgFor(d.toJSDate(), cfg);
      const { h: nSh, m: nSm } = parseHHmm(nextDayCfg.workday_start);
      dt = d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
      continue;
    }

    if (remainingMin <= avail) {
      dt = dt.plus({ minutes: remainingMin });
      remainingMin = 0;
      break;
    } else {
      remainingMin -= avail;
      // Siguiente día hábil al inicio
      let d = dt.plus({ days: 1 }).startOf("day");
      while (!isWorkdayLuxon(d, dayCfg.workdays)) d = d.plus({ days: 1 });
      const nextDayCfg = effectiveCfgFor(d.toJSDate(), cfg);
      const { h: nSh, m: nSm } = parseHHmm(nextDayCfg.workday_start);
      dt = d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
    }
  }
  return dt;
}

/* ─────────────── regla de despacho: NUNCA después de 16:30 ─────────────── */

/**
 * Ajusta la hora de despacho: si cae después del corte (16:30) o fuera de jornada,
 * mueve al siguiente día hábil al inicio de jornada del día (con sábado si aplica).
 * Además, en sábado aplica límite de entrega 11:00 AM.
 */
function clampDispatchToCutoff(proposed, cfg) {
  const tz = cfg?.timezone || "America/Bogota";
  let dt = proposed.setZone(tz);

  while (true) {
    const dayCfg = effectiveCfgFor(dt.toJSDate(), cfg);
    const { h: sh, m: sm } = parseHHmm(dayCfg.workday_start);
    const { h: eh, m: em } = parseHHmm(dayCfg.workday_end);

    const start = dt.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

    // Corte general 16:30
    const cutoff1630 = dt.set({ hour: 16, minute: 30, second: 0, millisecond: 0 });

    // Si es sábado, tope adicional 11:00
    const isSaturday = dt.weekday === 6; // 1=Mon..7=Sun (Luxon), Saturday=6
    const saturdayCut = dt.set({ hour: 11, minute: 0, second: 0, millisecond: 0 });

    // último permitido = mínimo entre fin de jornada, 16:30 y (si sábado) 11:00
    let lastAllowed = end < cutoff1630 ? end : cutoff1630;
    if (isSaturday && saturdayCut < lastAllowed) lastAllowed = saturdayCut;

    if (!isWorkdayLuxon(dt, dayCfg.workdays) || dt > lastAllowed) {
      // siguiente día hábil al inicio
      let d = dt.plus({ days: 1 }).startOf("day");
      while (!isWorkdayLuxon(d, dayCfg.workdays)) d = d.plus({ days: 1 });
      const nextCfg = effectiveCfgFor(d.toJSDate(), cfg);
      const { h: nSh, m: nSm } = parseHHmm(nextCfg.workday_start);
      dt = d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
      continue;
    }

    if (dt < start) dt = start;
    return dt;
  }
}

// Cada unidad con SKU que termina en "1T" equivale a 25 bultos; si no, 1:1
function bagsForItem(it) {
  const sku = it?.sku || it?.product?.sku || "";
  const perUnit = typeof sku === "string" && sku.trim().endsWith("1T") ? 25 : 1;
  return Number(it?.qty_bags || 0) * perUnit;
}

// Límite adicional para la hora de entrega del sábado: 11:00 AM
function clampSaturdayDelivery(d) {
  const out = new Date(d);
  if (out.getDay() === 6) {
    out.setHours(11, 0, 0, 0);
  }
  return out;
}

/* ─────────────────────────── scheduling principal ───────────────────────── */

export async function scheduleOrderForItems(items, now, cfg) {
  const tz = cfg?.timezone || "America/Bogota";
  const nowDT = DateTime.fromJSDate(now, { zone: tz });

  // Pedidos abiertos que consumen capacidad (backlog)
  const openOrders = await prisma.order.findMany({
    where: { status: { in: backlogStatusesForDb() } },
    include: { items: { include: { product: true } } },
    orderBy: { created_at: "asc" },
  });

  // 1) Backlog existente (usa multiplicador 1T)
  let backlogPelletBags = 0,
    backlogNonPelletBags = 0;
  for (const o of openOrders) {
    for (const it of o.items) {
      const bags = bagsForItem({ ...it, product: it.product });
      if (it.product?.pelletized) backlogPelletBags += bags;
      else backlogNonPelletBags += bags;
    }
  }

  // 2) Bultos de la ORDEN ACTUAL (si el caller pasa `sku`, se aplica 1T; si no, 1:1)
  let bagsPellet = 0,
    bagsNon = 0;
  for (const it of items || []) {
    const b = bagsForItem(it);
    if (it.pelletized) bagsPellet += b;
    else bagsNon += b;
  }

  // 3) Horas requeridas según capacidad
  const pelletBph = Math.max(Number(cfg?.pellet_bph || 0), 1);
  const nonPelletBph = Math.max(Number(cfg?.non_pellet_bph || 0), 1);

  const startPellet = addWorkHours(nowDT, backlogPelletBags / pelletBph, cfg);
  const startNon = addWorkHours(nowDT, backlogNonPelletBags / nonPelletBph, cfg);

  const finPellet = addWorkHours(startPellet, bagsPellet / pelletBph, cfg);
  const finNon = addWorkHours(startNon, bagsNon / nonPelletBph, cfg);

  const readyAtDT = finPellet > finNon ? finPellet : finNon;

  // 4) Buffer desde ready hasta que puede salir a despacho
  const bufferMin = Number(cfg?.dispatch_buffer_min || 60);
  const proposedDispatch = readyAtDT.plus({ minutes: bufferMin });

  // Regla general (máximo 16:30, respeta jornada + sábado 11:00)
  const deliveryDT = clampDispatchToCutoff(proposedDispatch, cfg);

  // 5) Saturday hard cap 11:00 (seguridad extra si llega por fuera)
  const deliveryJS = clampSaturdayDelivery(deliveryDT.toJSDate());

  const firstStart = startPellet < startNon ? startPellet : startNon;

  return {
    scheduled_at: firstStart.toJSDate(),
    ready_at: readyAtDT.toJSDate(),
    delivery_at: deliveryJS,
  };
}
