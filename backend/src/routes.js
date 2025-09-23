// backend/src/routes.js
import express from "express";
import { prisma } from "./db.js";
import { scheduleOrderForItems } from "./scheduler.js";
import { Prisma, OrderStatus } from "@prisma/client";

export const router = express.Router();

/* ─────────── Serializadores numéricos ─────────── */
const toIntCOP = (v) => (v == null ? null : Math.round(Number(v)));
const toNum    = (v) => (v == null ? null : Number(v));

/* ─────────── Mapeo de estados canónicos ↔ enum BD ─────────── */
const _statusEnum = (Prisma?.OrderStatus ?? OrderStatus ?? {});
const _keys = Object.keys(_statusEnum);
const _vals = Object.values(_statusEnum);
const _has = (v) => _keys.includes(v) || _vals.includes(v);
const _asEnum = (v) => _statusEnum[v] ?? v;

/** Acepta: pending_payment|paid|processing|in_production|scheduled|ready|delivered|canceled */
function toDbStatus(s) {
  if (!s) return null;
  const canon = String(s).trim().toLowerCase();

  // Normalizaciones
  const map = {
    pending: "pending_payment",
    pending_payment: "pending_payment",
    paid: "paid",
    processing: "in_production",      // canónico → enum
    in_production: "in_production",
    scheduled: "scheduled",
    ready: "scheduled",                // canónico UI → enum
    delivered: "delivered",
    canceled: "canceled",
    cancelled: "canceled",
  };

  const picked = map[canon] || canon;
  if (_has(picked)) return _asEnum(picked);
  return null;
}

/* ─────────── Aux: bultos (SKU 1T ⇒ 25 bultos por unidad) ─────────── */
function bagsForItem(it) {
  const sku = it?.sku || it?.product?.sku || "";
  const perUnit = typeof sku === "string" && sku.trim().endsWith("1T") ? 25 : 1;
  return Number(it?.qty_bags || 0) * perUnit; // si ya viene en bultos, qty_bags; si se usa qty_unidades, adaptar aquí
}

/* ─────────── HEALTH ─────────── */
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ─────────── PRODUCTS ─────────── */

// GET /products?all=1  (si no, solo activos)
router.get("/products", async (req, res) => {
  const all = req.query.all === "1" || req.query.all === "true";
  const where = all ? {} : { active: true };
  const prods = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
  });

  const out = prods.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    active: !!p.active,
    pelletized: !!p.pelletized,
    price_per_bag: toIntCOP(p.price_per_bag), // number entero COP
  }));

  res.json(out);
});

// PATCH /products/:id  { price_per_bag?, active? }
router.patch("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = {};

    if (req.body.price_per_bag != null) {
      const v = Number(req.body.price_per_bag);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ error: "price_per_bag inválido" });
      }
      data.price_per_bag = Math.round(v);
    }
    if (req.body.active != null) data.active = !!req.body.active;

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    // Dispara sync de catálogo (opcional)
    await fireCatalogSync(updated);

    res.json({
      id: updated.id,
      sku: updated.sku,
      name: updated.name,
      active: !!updated.active,
      price_per_bag: toIntCOP(updated.price_per_bag),
    });
  } catch (e) {
    console.error("PATCH /products error", e);
    res.status(500).json({ error: "update_failed" });
  }
});

/* ─────────── CUSTOMERS ─────────── */

router.get("/customers", async (_req, res) => {
  const cs = await prisma.customer.findMany({
    orderBy: { created_at: "desc" },
  });
  const out = cs.map((c) => ({
    id: c.id,
    name: c.name,
    whatsapp_phone: c.whatsapp_phone,
    doc_type: c.doc_type,
    doc_number: c.doc_number,
    billing_email: c.billing_email,
    discount_pct: toNum(c.discount_pct) ?? 0,
  }));
  res.json(out);
});

// PATCH /customers/:id  { discount_pct }
router.patch("/customers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dp = req.body.discount_pct;

    if (dp == null) {
      return res.status(400).json({ error: "discount_pct requerido" });
    }
    const v = Number(dp);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return res.status(400).json({ error: "discount_pct debe estar entre 0 y 100" });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: { discount_pct: v },
    });

    res.json({
      id: updated.id,
      discount_pct: toNum(updated.discount_pct) ?? 0,
    });
  } catch (e) {
    console.error("PATCH /customers error", e);
    res.status(500).json({ error: "update_failed" });
  }
});

/* ─────────── ORDERS ─────────── */

// GET /orders?status=&customer=&date=(week|month|thismonth)
router.get("/orders", async (req, res) => {
  try {
    const qStatus = req.query.status?.toString();
    const qCustomer = req.query.customer?.toString();
    const qDate = req.query.date?.toString();

    const where = {};

    // Estado
    const safe = toDbStatus(qStatus);
    if (safe) where.status = safe;

    // Cliente (por nombre o id)
    if (qCustomer) {
      where.OR = [
        { customer: { name: { contains: qCustomer, mode: "insensitive" } } },
        { customer_id: qCustomer },
      ];
    }

    // Fechas
    const now = new Date();
    const start = new Date(now);
    if (qDate === "week") {
      start.setDate(now.getDate() - 7);
    } else if (qDate === "month") {
      start.setMonth(now.getMonth() - 1);
    } else if (qDate === "thismonth") {
      start.setDate(1);
    }
    if (["week", "month", "thismonth"].includes(qDate)) {
      where.created_at = { gte: start, lte: now };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { created_at: "desc" },
    });

    // Totales por estado (en bultos); ready ≡ scheduled, processing ≡ in_production
    const totals_by_status = {};
    const canonize = (s) => {
      if (s === "in_production") return "processing";
      if (s === "scheduled") return "ready";
      return s;
    };

    const mapped = orders.map((o) => {
      const total_bags = o.items.reduce((s, it) => {
        // Aquí usamos qty_bags ya expresado en bultos (si almacenas unidades, adapta con 1T=25)
        return s + Number(it.qty_bags || 0);
      }, 0);

      const canon = canonize(o.status);
      totals_by_status[canon] = (totals_by_status[canon] || 0) + total_bags;

      return {
        id: o.id,
        status: canon,
        created_at: o.created_at,
        scheduled_at: o.scheduled_at,
        ready_at: o.ready_at,
        delivery_at: o.delivery_at,
        customer: o.customer ? { id: o.customer.id, name: o.customer.name } : null,
        subtotal: toIntCOP(o.subtotal_cop),
        discount_total: toIntCOP(o.discount_total_cop),
        total: toIntCOP(o.total_cop),
        items: o.items.map((it) => ({
          id: it.id,
          product_id: it.product_id,
          sku: it.product?.sku,
          name: it.product?.name,
          pelletized: !!it.product?.pelletized,
          qty_bags: Number(it.qty_bags || 0),
          unit_price_cop: toIntCOP(it.unit_price_cop),
        })),
        total_bags,
      };
    });

    res.json({ orders: mapped, totals_by_status });
  } catch (e) {
    console.error("GET /orders error", e);
    res.status(500).json({ error: "list_failed" });
  }
});

// PATCH /orders/:id  { status }
router.patch("/orders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dbStatus = toDbStatus(req.body.status);
    if (!dbStatus) return res.status(400).json({ error: "status inválido" });

    const updated = await prisma.order.update({
      where: { id },
      data: { status: dbStatus },
      include: { customer: true, items: { include: { product: true } } },
    });

    res.json({
      id: updated.id,
      status: updated.status,
    });
  } catch (e) {
    console.error("PATCH /orders/:id error", e);
    res.status(500).json({ error: "update_failed" });
  }
});

// POST /orders { customer_id, items:[{product_id, qty_bags}] }
router.post("/orders", async (req, res) => {
  try {
    const { customer_id, items } = req.body || {};
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "payload inválido" });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
    if (!customer) return res.status(400).json({ error: "cliente inexistente" });

    // Carga de productos
    const prodIds = items.map((i) => i.product_id);
    const products = await prisma.product.findMany({ where: { id: { in: prodIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Items para DB (qty_bags se interpreta ya en bultos)
    const itemsForDb = [];
    for (const it of items) {
      const p = byId.get(it.product_id);
      if (!p) continue;
      const qty = Math.max(0, Number(it.qty_bags || 0));
      itemsForDb.push({
        product_id: p.id,
        qty_bags: qty,
        unit_price_cop: Math.round(Number(p.price_per_bag || 0)),
      });
    }
    if (itemsForDb.length === 0) return res.status(400).json({ error: "sin items válidos" });

    // Totales
    const subtotal = itemsForDb.reduce(
      (s, it) => s + Number(it.qty_bags) * Number(it.unit_price_cop),
      0
    );
    const discountPct = Number(customer.discount_pct || 0);
    const discountTotal = Math.round((subtotal * discountPct) / 100);
    const total = subtotal - discountTotal;

    // Scheduling (pellet / no pellet)
    const richItems = itemsForDb.map((it) => {
      const p = byId.get(it.product_id);
      return { product_id: it.product_id, pelletized: !!p?.pelletized, qty_bags: it.qty_bags };
    });

    const schedCfg = {
      timezone: "America/Bogota",
      workdays: "Mon,Tue,Wed,Thu,Fri,Sat",
      workday_start: "08:00",
      workday_end: "17:00",
      dispatch_buffer_min: 60,
      pellet_bph: 80,
      non_pellet_bph: 80,
      sat_workday_start: "08:00",
      sat_workday_end: "11:00",
      sat_pellet_bph: 60,
      sat_non_pellet_bph: 60,
    };

    const sch = await scheduleOrderForItems(richItems, new Date(), schedCfg);

    const created = await prisma.order.create({
      data: {
        customer_id,
        status: "pending_payment",
        scheduled_at: sch.scheduled_at,
        ready_at: sch.ready_at,
        delivery_at: sch.delivery_at,
        subtotal_cop: subtotal,
        discount_total_cop: discountTotal,
        total_cop: total,
        items: { createMany: { data: itemsForDb } },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    res.json({
      order: {
        id: created.id,
        status: created.status,
        created_at: created.created_at,
        scheduled_at: created.scheduled_at,
        ready_at: created.ready_at,
        delivery_at: created.delivery_at,
        customer: created.customer
          ? { id: created.customer.id, name: created.customer.name }
          : null,
        subtotal: toIntCOP(created.subtotal_cop),
        discount_total: toIntCOP(created.discount_total_cop),
        total: toIntCOP(created.total_cop),
        items: created.items.map((it) => ({
          id: it.id,
          product_id: it.product_id,
          sku: it.product?.sku,
          name: it.product?.name,
          pelletized: !!it.product?.pelletized,
          qty_bags: Number(it.qty_bags || 0),
          unit_price_cop: toIntCOP(it.unit_price_cop),
        })),
      },
    });
  } catch (e) {
    console.error("POST /orders error", e);
    res.status(500).json({ error: "create_failed" });
  }
});

/* ─────────── Catálogo: sync opcional ─────────── */
async function fireCatalogSync(prod) {
  try {
    const { WA_CATALOG_SYNC_URL } = process.env;
    if (!WA_CATALOG_SYNC_URL) return;
    await fetch(WA_CATALOG_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: prod.sku,
        name: prod.name,
        price_cop: Math.round(Number(prod.price_per_bag || 0)),
        active: !!prod.active,
      }),
    });
  } catch (e) {
    console.error("fireCatalogSync error:", e?.message || e);
  }
}

export default router;
