// backend/src/scheduler.js
import { DateTime } from "luxon";
import { prisma } from "./db.js";

/* ───────────────────────── util de días hábiles ───────────────────────── */

function isWorkdayLuxon(dt, workdaysStr = "Mon,Tue,Wed,Thu,Fri,Sat") {
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const set = new Set(
    (workdaysStr || "Mon,Tue,Wed,Thu,Fri,Sat").split(",").map(w => map[w.trim()])
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
    return (isSat && satVal != null && satVal !== "") ? satVal : cfg?.[defKey];
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
    workday_end:   pick("sat_workday_end",   "workday_end")   || "17:00",
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
  const end   = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

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
 */
function clampDispatchToCutoff(proposed, cfg) {
  const tz = cfg?.timezone || "America/Bogota";
  let dt = proposed.setZone(tz);

  while (true) {
    const dayCfg = effectiveCfgFor(dt.toJSDate(), cfg);
    const { h: sh, m: sm } = parseHHmm(dayCfg.workday_start);
    const { h: eh, m: em } = parseHHmm(dayCfg.workday_end);

    const start  = dt.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end    = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    const cutoff = dt.set({ hour: 16, minute: 30, second: 0, millisecond: 0 });

    // Máximo entre jornada y corte 16:30 (el menor de los dos)
    const lastAllowed = end < cutoff ? end : cutoff;

    // Si no es día hábil o está después del permitido, saltar
    if (!isWorkdayLuxon(dt, dayCfg.workdays) || dt > lastAllowed) {
      // siguiente día hábil al inicio de jornada
      let d = dt.plus({ days: 1 }).startOf("day");
      while (!isWorkdayLuxon(d, dayCfg.workdays)) d = d.plus({ days: 1 });
      const nextCfg = effectiveCfgFor(d.toJSDate(), cfg);
      const { h: nSh, m: nSm } = parseHHmm(nextCfg.workday_start);
      dt = d.set({ hour: nSh, minute: nSm, second: 0, millisecond: 0 });
      continue;
    }

    // Si cae antes del inicio, arráncalo en inicio de jornada
    if (dt < start) dt = start;

    return dt;
  }
}

/* ─────────────────────────── scheduling principal ───────────────────────── */

export async function scheduleOrderForItems(items, now, cfg) {
  const tz = cfg?.timezone || "America/Bogota";
  const nowDT = DateTime.fromJSDate(now, { zone: tz });

  // Pedidos abiertos que consumen capacidad (backlog).
  // Usamos los estados que representan “en cola / producción / listos no despachados”.
  // Ajusta si tu enum cambia.
  const openOrders = await prisma.order.findMany({
    where: { status: { in: ["paid", "scheduled", "in_production", "processing", "ready"] } },
    include: { items: { include: { product: true } } },
    orderBy: { created_at: "asc" },
  });

  let backlogPelletBags = 0, backlogNonPelletBags = 0;
  for (const o of openOrders) {
    for (const it of o.items) {
      if (it.product?.pelletized) backlogPelletBags += Number(it.qty_bags || 0);
      else backlogNonPelletBags += Number(it.qty_bags || 0);
    }
  }

  const bagsPellet = items.filter(i => i.pelletized).reduce((s, i) => s + Number(i.qty_bags || 0), 0);
  const bagsNon    = items.filter(i => !i.pelletized).reduce((s, i) => s + Number(i.qty_bags || 0), 0);

  // Para sumar horas de backlog y del pedido, usamos la capacidad “general” (default del cfg).
  // addWorkHours ya consulta las variantes de jornada por día durante la iteración.
  const pelletBph    = Math.max(Number(cfg?.pellet_bph || 0), 1);
  const nonPelletBph = Math.max(Number(cfg?.non_pellet_bph || 0), 1);

  const startPellet = addWorkHours(nowDT, backlogPelletBags / pelletBph, cfg);
  const startNon    = addWorkHours(nowDT, backlogNonPelletBags / nonPelletBph, cfg);

  const finPellet   = addWorkHours(startPellet, bagsPellet / pelletBph, cfg);
  const finNon      = addWorkHours(startNon,    bagsNon    / nonPelletBph, cfg);

  const readyAtDT = finPellet > finNon ? finPellet : finNon;

  // Buffer desde ready hasta que puede salir a despacho
  const bufferMin = Number(cfg?.dispatch_buffer_min || 60);
  const proposedDispatch = readyAtDT.plus({ minutes: bufferMin });

  // Regla: nunca después de 16:30; si se pasa, al siguiente día hábil al inicio
  const deliveryDT = clampDispatchToCutoff(proposedDispatch, cfg);

  const firstStart = startPellet < startNon ? startPellet : startNon;

  return {
    scheduled_at: firstStart.toJSDate(),
    ready_at:     readyAtDT.toJSDate(),
    delivery_at:  deliveryDT.toJSDate(),
  };
}
