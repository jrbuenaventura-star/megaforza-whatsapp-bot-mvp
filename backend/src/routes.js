import express from "express";
import multer from "multer";
import { prisma } from "./db.js";
import { scheduleOrderForItems } from "./scheduler.js";
import { Prisma, OrderStatus } from "@prisma/client";

const upload = multer({ dest: "uploads/" });
export const router = express.Router();

/* ───────────────────────── helpers ───────────────────────── */

// Estados canónicos de la app (nuestro “vocabulario”)
const CANON_STATUSES = [
  "pending_payment",
  "processing",   // mapea a in_production en BD si no existe processing
  "ready",        // mapea a scheduled en BD si no existe ready
  "delivered",
  "canceled",
];

// Sinónimos → canónico
const STATUS_SYNONYMS = {
  // pagos / producción
  paid: "processing",
  payment_received: "processing",
  in_production: "processing",
  "in-production": "processing",
  produccion: "processing",
  producción: "processing",

  // programado / listo
  scheduled: "ready",
  programado: "ready",
  listo: "ready",

  // cancelaciones (GB)
  cancelled: "canceled",
  cancel: "canceled",

  // pendientes
  pending: "pending_payment",
  awaiting_payment: "pending_payment",
};

/** Convierte el input a estado canónico (string) o null. */
function canonStatus(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const canon = STATUS_SYNONYMS[raw] ?? raw;
  return CANON_STATUSES.includes(canon) ? canon : null;
}

/**
 * Devuelve el valor que **sí acepta la BD**:
 * - Si la BD ya tiene ese valor exacto, úsalo.
 * - Si no, mapea:
 *    processing  -> in_production
 *    ready       -> scheduled
 * - Si la BD ya usa processing/ready, respeta eso.
 * - Si nada calza, retorna null.
 */
function toDbStatus(input) {
  const canon = canonStatus(input);
  if (!canon) return null;

  const statusEnum = (Prisma?.OrderStatus ?? OrderStatus ?? {});
  const enumKeys = Object.keys(statusEnum);
  const enumVals = Object.values(statusEnum);

  const has = (val) => enumKeys.includes(val) || enumVals.includes(val);
  const asEnum = (val) => statusEnum[val] ?? val;

  if (has(canon)) return asEnum(canon);

  const forwardMap = { processing: "in_production", ready: "scheduled" };
  const backMap    = { in_production: "processing", scheduled: "ready" };

  if (forwardMap[canon] && has(forwardMap[canon])) return asEnum(forwardMap[canon]);
  if (backMap[canon]    && has(backMap[canon]))    return asEnum(backMap[canon]);

  return has(canon) ? asEnum(canon) : null;
}

const toIntCOP = v => (v == null ? null : Math.round(Number(v)));
const toNum    = v => (v == null ? null : Number(v));

// Sanitiza número en request
function asNumberOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Sync Catálogo WA (usa sku como retailer_id) ──
async function syncWhatsAppCatalogPrice(product) {
  try {
    const {
      WA_CATALOG_SYNC_URL,            // opcional: tu propio webhook/worker
      WA_CATALOG_ID,                  // catálogo de Commerce Manager
      WA_SYSTEM_ACCESS_TOKEN,         // token de sistema/app
      WA_GRAPH_API_VERSION = "v20.0", // versión Graph
    } = process.env;

    const sku = product?.sku;
    const price = toIntCOP(product?.price_per_bag);

    if (!sku || !Number.isFinite(price)) return;

    // 1) Si tienes un worker propio, úsalo y deja que él maneje retries, logs, etc.
    if (WA_CATALOG_SYNC_URL) {
      await fetch(WA_CATALOG_SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, price_cop: price }),
      });
      return;
    }

    // 2) Sync directo al Graph API (Commerce Manager batch)
    if (!WA_CATALOG_ID || !WA_SYSTEM_ACCESS_TOKEN) return;

    // Asumimos que en el catálogo el retailer_id == sku
    const url = `https://graph.facebook.com/${WA_GRAPH_API_VERSION}/${WA_CATALOG_ID}/batch`;
    const requests = [
      {
        method: "UPDATE",
        // actualizar por retailer_id (sku)
        relative_url: `products?retailer_id=${encodeURIComponent(sku)}`,
        // Precio como "<valor> COP"
        body: `price=${encodeURIComponent(price + " COP")}`,
      },
    ];

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_SYSTEM_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(`WA Catalog sync failed: ${r.status} ${JSON.stringify(data)}`);
    }
  } catch (e) {
    console.warn("No se pudo sincronizar con Catálogo de WhatsApp:", e?.message || e);
  }
}

/* ───────────────────────── endpoints ───────────────────────── */

router.get("/health", (req, res) => res.json({ ok: true }));

/* ───────── Productos ───────── */

// Lista productos (por defecto activos). Si quieres todos, pásale ?all=1
router.get("/products", async (req, res) => {
  const showAll = String(req.query.all || "").trim() === "1";
  const where = showAll ? {} : { active: true };

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
  });

  res.json(
    products.map((p) => ({
      ...p,
      price_per_bag: toIntCOP(p.price_per_bag),
    }))
  );
});

// Actualiza precio (COP entero) y/o estado activo; dispara sync a catálogo
router.patch("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const rawPrice = req.body?.price_per_bag;
    const rawActive = req.body?.active;

    const data = {};

    if (rawPrice !== undefined) {
      const n = Number(rawPrice);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "price_per_bag debe ser un número ≥ 0" });
      }
      const asInt = Math.round(n); // COP enteros
      data.price_per_bag = new Prisma.Decimal(asInt);
    }

    if (rawActive !== undefined) {
      data.active = Boolean(rawActive);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    const p = await prisma.product.update({ where: { id }, data });

    // Sync catálogo (best-effort, no bloquea)
    try { await syncWhatsAppCatalogPrice(p); } catch {}

    res.json({ ...p, price_per_bag: toIntCOP(p.price_per_bag) });
  } catch (e) {
    console.error("PATCH /products/:id error", e);
    res.status(500).json({ error: "Error actualizando producto" });
  }
});

/* ───────── Capacidad ───────── */

router.get("/config/capacity", async (req, res) => {
  const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
  res.json(cfg);
});

router.post("/config/capacity", async (req, res) => {
  const data = req.body;
  const cfg = await prisma.capacityConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(cfg);
});

/* ───────── Clientes ───────── */

// Listado con búsqueda básica
router.get("/customers", async (req, res) => {
  const q = req.query.q?.toString() || "";
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { whatsapp_phone: { contains: q } },
        { doc_number: { contains: q } },
      ],
    },
    orderBy: { created_at: "desc" },
  });

  res.json(
    customers.map((c) => ({
      ...c,
      discount_pct: toNum(c.discount_pct),
    }))
  );
});

router.post(
  "/customers",
  upload.fields([{ name: "rut" }, { name: "camara" }]),
  async (req, res) => {
    try {
      const {
        name,
        doc_type,
        doc_number,
        nit_dv,
        billing_email,
        whatsapp_phone,
        discount_pct,
      } = req.body;

      const rut = req.files?.rut?.[0]?.path || null;
      const cam = req.files?.camara?.[0]?.path || null;

      let d = asNumberOrNull(discount_pct);
      d = d == null ? 0 : Math.min(100, Math.max(0, d)); // clamp 0–100

      const c = await prisma.customer.create({
        data: {
          name,
          doc_type,
          doc_number,
          nit_dv,
          billing_email,
          whatsapp_phone,
          discount_pct: new Prisma.Decimal(Number(d).toFixed(2)),
          rut_url: rut,
          camara_url: cam,
        },
      });

      res.json({ ...c, discount_pct: toNum(c.discount_pct) });
    } catch (e) {
      console.error("POST /customers error", e);
      res.status(500).json({ error: "Error creando cliente" });
    }
  }
);

// Solo actualizar descuento (%)
router.patch("/customers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const d = asNumberOrNull(req.body.discount_pct);

    if (d === null) {
      return res.status(400).json({ error: "discount_pct requerido" });
    }
    if (d < 0 || d > 100) {
      return res.status(400).json({ error: "discount_pct debe estar entre 0 y 100" });
    }

    const c = await prisma.customer.update({
      where: { id },
      data: { discount_pct: new Prisma.Decimal(Number(d).toFixed(2)) },
    });

    res.json({ ...c, discount_pct: toNum(c.discount_pct) });
  } catch (e) {
    console.error("PATCH /customers/:id error", e);
    res.status(500).json({ error: "Error actualizando cliente" });
  }
});

/* ───────── Pedidos ───────── */

router.get("/orders", async (req, res) => {
  const qStatus = req.query.status?.toString();
  const safe = toDbStatus(qStatus);
  const where = safe ? { status: safe } : {};
  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { created_at: "desc" },
  });
  res.json(orders);
});

router.post("/orders", async (req, res) => {
  try {
    const { customer_id, items } = req.body;
    const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
    if (!customer) return res.status(400).json({ error: "Customer not found" });

    const prods = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.product_id) } },
    });
    const prodsMap = new Map(prods.map((p) => [p.id, p]));
    const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });

    let subtotal = 0, discount_total = 0, total_bags = 0;
    const orderItemsData = [];
    for (const it of items) {
      const p = prodsMap.get(it.product_id);
      if (!p) continue;
      const qty = Number(it.qty_bags);
      total_bags += qty;
      const unitPrice = toIntCOP(p.price_per_bag);
      const discountPct = Number(customer.discount_pct || 0);
      const line = qty * unitPrice * (discountPct ? 1 - discountPct / 100 : 1);
      subtotal += qty * unitPrice;
      discount_total += qty * unitPrice * (discountPct / 100);
      orderItemsData.push({
        product_id: p.id,
        qty_bags: qty,
        unit_price: unitPrice,
        discount_pct_applied: discountPct,
        line_total: line,
      });
    }
    const total = subtotal - discount_total;

    const DEFAULT_STATUS = toDbStatus("pending_payment");

    const order = await prisma.order.create({
      data: {
        customer_id,
        status: DEFAULT_STATUS,
        total_bags,
        subtotal,
        discount_total,
        total,
        items: { create: orderItemsData },
      },
      include: { items: { include: { product: true } } },
    });

    const enriched = order.items.map((i) => ({
  qty_bags: i.qty_bags,
  pelletized: i.product.pelletized,
  sku: i.product.sku,
}));

    const sch = await scheduleOrderForItems(enriched, new Date(), cfg);
    await prisma.order.update({
      where: { id: order.id },
      data: { scheduled_at: sch.scheduled_at, ready_at: sch.ready_at },
    });

    res.json({ order, estimated_delivery_at: sch.delivery_at });
  } catch (e) {
    console.error("POST /orders error", e);
    res.status(500).json({ error: "Error creando orden" });
  }
});

// Actualizar estado de una orden
router.patch("/orders/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const dbStatus = toDbStatus(status);
    if (!dbStatus) {
      return res
        .status(400)
        .json({ error: `status inválido. Use: ${CANON_STATUSES.join(", ")}` });
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: dbStatus },
      include: { customer: true, items: true },
    });
    res.json(order);
  } catch (e) {
    console.error("PATCH /orders/:id error", e);
    res.status(500).json({ error: "Error actualizando estado" });
  }
});

router.post("/orders/:id/markDelivered", async (req, res) => {
  const safe = toDbStatus("delivered");
  const o = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: safe },
  });
  res.json(o);
});

// Reporte: pendiente por cliente
router.get("/reports/pendingByCustomer", async (req, res) => {
  const pendingSet = ["pending_payment", "processing", "ready"]; // canónicos
  const pendingForDb = pendingSet
    .map((s) => toDbStatus(s))
    .filter(Boolean);

  const orders = await prisma.order.findMany({
    where: { status: { in: pendingForDb } },
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { created_at: "asc" },
  });

  const report = {};
  for (const o of orders) {
    const cust = o.customer.name;
    if (!report[cust]) report[cust] = {};
    for (const it of o.items) {
      const prod = it.product.name;
      report[cust][prod] = (report[cust][prod] || 0) + it.qty_bags;
    }
  }
  res.json(report);
});
