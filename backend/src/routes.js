// backend/src/routes.js
import express from "express";
import { prisma } from "./db.js";
import { Prisma, OrderStatus } from "@prisma/client";
import { scheduleOrderForItems } from "./scheduler.js";

// ───────────────────────── helpers ─────────────────────────
const toIntCOP = (v) => (v == null ? null : Math.round(Number(v)));
const toNum    = (v) => (v == null ? null : Number(v));

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ───────────────────────── mapeo de estados ─────────────────────────
const CANON_TO_DB = {
  pending_payment: "pending_payment",
  paid: "paid",
  processing: "in_production", // canónico → BD
  in_production: "in_production",
  ready: "scheduled",          // canónico → BD
  scheduled: "scheduled",
  delivered: "delivered",
  canceled: "canceled",
};

const DB_ENUM   = Prisma?.OrderStatus ?? OrderStatus ?? {};
const DB_VALUES = new Set(Object.values(DB_ENUM));
const DB_KEYS   = new Set(Object.keys(DB_ENUM));

function toDbStatus(maybe) {
  if (!maybe) return null;
  const s = String(maybe).trim().toLowerCase();
  const mapped = CANON_TO_DB[s] || s;
  if (DB_VALUES.has(mapped) || DB_KEYS.has(mapped)) {
    return DB_ENUM[mapped] ?? mapped;
  }
  return null;
}

function toCanonStatus(dbValue) {
  const v = String(dbValue || "").toLowerCase();
  if (v === "in_production") return "processing";
  if (v === "scheduled")     return "ready";
  return v;
}

// ───────────────────────── serialización ─────────────────────────
function productOut(p) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    active: Boolean(p.active),
    pelletized: Boolean(p.pelletized),
    price_per_bag: toIntCOP(p.price_per_bag),
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

function customerOut(c) {
  return {
    id: c.id,
    name: c.name,
    whatsapp_phone: c.whatsapp_phone,
    discount_pct: toNum(c.discount_pct),
    billing_email: c.billing_email,
    doc_type: c.doc_type,
    doc_number: c.doc_number,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

// ───────────────────────── router ─────────────────────────
export const router = express.Router();

// Health
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ───────────────────────── productos ─────────────────────────

// GET /products?all=1
router.get("/products", async (req, res) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? {} : { active: true };
    const prods = await prisma.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    res.json(prods.map(productOut));
  } catch (e) {
    console.error("GET /products error", e);
    res.status(500).json({ error: "get_products_failed" });
  }
});

// PATCH /products/:id  { price_per_bag?: number, active?: boolean, name?: string }
router.patch("/products/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const data = {};

    if (req.body.name != null) data.name = String(req.body.name);
    if (req.body.active != null) data.active = Boolean(req.body.active);

    if (req.body.price_per_bag != null) {
      const v = Math.round(Number(req.body.price_per_bag));
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ error: "invalid_price" });
      }
      data.price_per_bag = v; // Prisma Decimal admite number/string
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    // Sync catálogo opcional
    try {
      const syncUrl = process.env.WA_CATALOG_SYNC_URL;
      if (syncUrl) {
        // usar fetch global de Node 18+
        await fetch(syncUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: updated.sku,
            price_cop: toIntCOP(updated.price_per_bag),
            active: !!updated.active,
          }),
        }).catch(() => {});
      }
    } catch (_) { /* noop */ }

    res.json(productOut(updated));
  } catch (e) {
    console.error("PATCH /products/:id error", e);
    res.status(500).json({ error: "patch_product_failed" });
  }
});

// ───────────────────────── clientes ─────────────────────────

// GET /customers
router.get("/customers", async (_req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(customers.map(customerOut));
  } catch (e) {
    console.error("GET /customers error", e);
    res.status(500).json({ error: "get_customers_failed" });
  }
});

// PATCH /customers/:id  { discount_pct?: number, name?, billing_email? }
router.patch("/customers/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const data = {};

    if (req.body.discount_pct != null) {
      const pct = clamp(req.body.discount_pct, 0, 100);
      data.discount_pct = pct;
    }
    if (req.body.name != null) data.name = String(req.body.name);
    if (req.body.billing_email != null) data.billing_email = String(req.body.billing_email);

    const updated = await prisma.customer.update({ where: { id }, data });
    res.json(customerOut(updated));
  } catch (e) {
    console.error("PATCH /customers/:id error", e);
    res.status(500).json({ error: "patch_customer_failed" });
  }
});

// ───────────────────────── util de fechas para filtros ─────────────────────────
function daterangeFromQuery(token) {
  const now = new Date();
  const end = now;
  const start = new Date(now);

  if (token === "week") {
    start.setDate(now.getDate() - 7);
    return { gte: start, lte: end };
  }
  if (token === "month") {
    start.setMonth(now.getMonth() - 1);
    return { gte: start, lte: end };
  }
  if (token === "thismonth") {
    start.setDate(1);
    return { gte: start, lte: end };
  }
  return null;
}

// GET /orders?status=&customer=&date=week|month|thismonth
router.get("/orders", async (req, res) => {
  try {
    const qStatus   = req.query.status?.toString();
    const qCustomer = req.query.customer?.toString();
    const qDate     = req.query.date?.toString();

    const where = {};

    // Estado
    const st = toDbStatus(qStatus);
    if (st) where.status = st;

    // Cliente (nombre contiene o id exacto)
    if (qCustomer) {
      where.OR = [
        { customer: { name: { contains: qCustomer, mode: "insensitive" } } },
        { customer_id: qCustomer },
      ];
    }

    // Fecha
    const range = daterangeFromQuery(qDate);
    if (range) where.created_at = range;

    const orders = await prisma.order.findMany({
      where,
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { created_at: "desc" },
    });

    // Totales de bultos por estado (en canónico)
    const totals_by_status = {};
    for (const o of orders) {
      const canon = toCanonStatus(o.status);
      const bags = Number(o.total_bags || 0);
      totals_by_status[canon] = (totals_by_status[canon] || 0) + bags;
    }

    // Salida “friendly”
    const out = orders.map((o) => ({
      id: o.id,
      status: toCanonStatus(o.status),
      customer: o.customer ? customerOut(o.customer) : null,
      subtotal: toIntCOP(o.subtotal),
      discount_total: toIntCOP(o.discount_total),
      total: toIntCOP(o.total),
      total_bags: Number(o.total_bags || 0),
      scheduled_at: o.scheduled_at,
      ready_at: o.ready_at,
      delivery_at: o.delivery_at,
      created_at: o.created_at,
      items: o.items.map((it) => ({
        id: it.id,
        product: it.product ? productOut(it.product) : null,
        product_id: it.product_id,
        qty_bags: Number(it.qty_bags || 0),
        // Nota: en GET no exponemos unit_price/line_total para no “fijar” históricos aquí.
      })),
    }));

    res.json({ orders: out, totals_by_status });
  } catch (e) {
    console.error("GET /orders error", e);
    res.status(500).json({ error: "get_orders_failed" });
  }
});

// PATCH /orders/:id  { status }
router.patch("/orders/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const newStatus = toDbStatus(req.body?.status);
    if (!newStatus) return res.status(400).json({ error: "invalid_status" });

    const updated = await prisma.order.update({
      where: { id },
      data: { status: newStatus },
      include: { customer: true, items: { include: { product: true } } },
    });

    res.json({
      id: updated.id,
      status: toCanonStatus(updated.status),
      customer: updated.customer ? customerOut(updated.customer) : null,
      subtotal: toIntCOP(updated.subtotal),
      discount_total: toIntCOP(updated.discount_total),
      total: toIntCOP(updated.total),
      total_bags: Number(updated.total_bags || 0),
      scheduled_at: updated.scheduled_at,
      ready_at: updated.ready_at,
      delivery_at: updated.delivery_at,
      created_at: updated.created_at,
      items: updated.items.map((it) => ({
        id: it.id,
        product: it.product ? productOut(it.product) : null,
        product_id: it.product_id,
        qty_bags: Number(it.qty_bags || 0),
      })),
    });
  } catch (e) {
    console.error("PATCH /orders/:id error", e);
    res.status(500).json({ error: "patch_order_failed" });
  }
});

// POST /orders  { customer_id, items:[{product_id, qty_bags}] }
router.post("/orders", async (req, res) => {
  try {
    const { customer_id, items } = req.body || {};
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
    if (!customer) return res.status(400).json({ error: "customer_not_found" });

    // Cargar productos
    const prodIds = items.map((i) => String(i.product_id));
    const products = await prisma.product.findMany({ where: { id: { in: prodIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Calcular totales y preparar items con unit_price y line_total
let subtotal = 0;
let total_bags = 0;
const calcItems = [];

for (const it of items) {
  const p = byId.get(String(it.product_id));
  if (!p) {
    return res.status(400).json({ error: "product_not_found", product_id: it.product_id });
  }
  const qty = Number(it.qty_bags || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "invalid_qty", product_id: it.product_id });
  }

  const unit = toIntCOP(p.price_per_bag); // entero COP
  const line_total = unit * qty;

  subtotal += line_total;
  total_bags += qty;

  // ⚠️ Estos campos deben existir si tu schema los marca como NOT NULL
  calcItems.push({
    product_id: String(it.product_id),
    qty_bags: qty,
    unit_price: unit,
    line_total: line_total,
  });
}

const discountPct = clamp(customer.discount_pct ?? 0, 0, 100);
const discount_total = Math.round((subtotal * discountPct) / 100);
const total = Math.max(0, subtotal - discount_total);

// Scheduling (usa configuración simple desde env o defaults) … (deja tu código igual)
const schedCfg = {
  timezone: process.env.SCHED_TZ || "America/Bogota",
  workdays: process.env.SCHED_WORKDAYS || "Mon,Tue,Wed,Thu,Fri,Sat",
  dispatch_buffer_min: Number(process.env.SCHED_DISPATCH_BUFFER_MIN || 60),
  pellet_bph: Number(process.env.SCHED_PELLET_BPH || 60),
  non_pellet_bph: Number(process.env.SCHED_NON_PELLET_BPH || 60),
  sat_pellet_bph: Number(process.env.SCHED_SAT_PELLET_BPH || 40),
  sat_non_pellet_bph: Number(process.env.SCHED_SAT_NON_PELLET_BPH || 40),
  workday_start: process.env.SCHED_START || "08:00",
  workday_end:   process.env.SCHED_END   || "17:00",
  sat_workday_start: process.env.SCHED_SAT_START || "08:00",
  sat_workday_end:   process.env.SCHED_SAT_END   || "11:00",
};

// Enriquecer items para el scheduler … (deja tu código igual)
const schedItems = items.map((it) => {
  const p = byId.get(String(it.product_id));
  return {
    product_id: it.product_id,
    qty_bags: Number(it.qty_bags || 0),
    pelletized: Boolean(p?.pelletized),
    sku: p?.sku,
  };
});

const { scheduled_at, ready_at, delivery_at } =
  await scheduleOrderForItems(schedItems, new Date(), schedCfg);

// Crear orden con items que incluyen unit_price y line_total
const created = await prisma.order.create({
  data: {
    customer_id,
    status: toDbStatus("pending_payment"),
    subtotal,
    discount_total,
    total,
    total_bags,
    scheduled_at,
    ready_at,
    delivery_at,
    items: {
      create: calcItems,
    },
  },
  include: { customer: true, items: { include: { product: true } } },
});

// Respuesta (añadimos unit_price/line_total para verificación rápida)
res.status(201).json({
  order: {
    id: created.id,
    status: toCanonStatus(created.status),
    customer: created.customer ? customerOut(created.customer) : null,
    subtotal: toIntCOP(created.subtotal),
    discount_total: toIntCOP(created.discount_total),
    total: toIntCOP(created.total),
    total_bags: Number(created.total_bags || 0),
    scheduled_at: created.scheduled_at,
    ready_at: created.ready_at,
    delivery_at: created.delivery_at,
    created_at: created.created_at,
    items: created.items.map((it) => ({
      id: it.id,
      product: it.product ? productOut(it.product) : null,
      product_id: it.product_id,
      qty_bags: Number(it.qty_bags || 0),
      unit_price: toIntCOP(it.unit_price),
      line_total: toIntCOP(it.line_total),
    })),
  },
});
  } catch (e) {
    console.error("POST /orders error", e);
    res.status(500).json({ error: "create_order_failed" });
  }
});


export default router;
