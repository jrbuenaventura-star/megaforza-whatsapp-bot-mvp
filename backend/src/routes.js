import express from "express";
import multer from "multer";
import { prisma } from "./db.js";
import { scheduleOrderForItems } from "./scheduler.js";
import { Prisma, OrderStatus } from "@prisma/client";

const upload = multer({ dest: "uploads/" });
export const router = express.Router();

/* ───────────────────────── helpers de estado ───────────────────────── */

// Estados canónicos que usamos en la app
const CANON_STATUSES = [
  "pending_payment",
  "processing",
  "ready",
  "delivered",
  "canceled",
];

// Mapa de sinónimos → estado canónico
const STATUS_SYNONYMS = {
  // pagos
  paid: "processing",
  payment_received: "processing",

  // producción
  in_production: "processing",
  "in-production": "processing",
  produccion: "processing",
  producción: "processing",

  // programado / listo
  scheduled: "ready",
  programado: "ready",
  listo: "ready",

  // cancelaciones (inglés GB y variantes)
  cancelled: "canceled",
  cancel: "canceled",

  // pendientes
  pending: "pending_payment",
  awaiting_payment: "pending_payment",
};

/**
 * Convierte cualquier entrada a un estado **canónico** (string) o `null` si no es válido.
 * Acepta sinónimos y normaliza a minúsculas.
 */
function canonStatus(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const canon = STATUS_SYNONYMS[raw] ?? raw;
  return CANON_STATUSES.includes(canon) ? canon : null;
}

/**
 * Devuelve un valor válido para guardar en DB:
 * - Usa el enum de Prisma si existe (aceptando CLAVES UPPERCASE o lowercase)
 * - Si no hay enum (columna texto), devuelve el string canónico en minúsculas
 */
function toDbStatus(input) {
  const canon = canonStatus(input); // usa tu función que normaliza y valida
  if (!canon) return null;

  const statusEnum = Prisma?.OrderStatus ?? OrderStatus ?? {};
  // 1) enum UPPERCASE (p. ej. PENDING_PAYMENT)
  if (statusEnum[canon.toUpperCase()]) return statusEnum[canon.toUpperCase()];
  // 2) enum lowercase (p. ej. pending_payment)
  if (statusEnum[canon]) return statusEnum[canon];
  // 3) fallback a string (DB sin enum)
  return canon;
}

/* ───────────────────────── endpoints ───────────────────────── */

router.get("/health", (req, res) => res.json({ ok: true }));

// Productos
router.get("/products", async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  res.json(products);
});

router.patch("/products/:id", async (req, res) => {
  const { price_per_bag, active } = req.body;
  const p = await prisma.product.update({
    where: { id: req.params.id },
    data: { price_per_bag, active },
  });
  res.json(p);
});

// Capacidad
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

// Clientes
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
  res.json(customers);
});

router.post(
  "/customers",
  upload.fields([{ name: "rut" }, { name: "camara" }]),
  async (req, res) => {
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
    const c = await prisma.customer.create({
      data: {
        name,
        doc_type,
        doc_number,
        nit_dv,
        billing_email,
        whatsapp_phone,
        discount_pct: Number(discount_pct || 0),
        rut_url: rut,
        camara_url: cam,
      },
    });
    res.json(c);
  }
);

router.patch("/customers/:id", async (req, res) => {
  const { discount_pct } = req.body;
  const c = await prisma.customer.update({
    where: { id: req.params.id },
    data: { discount_pct: Number(discount_pct || 0) },
  });
  res.json(c);
});

// Pedidos
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
  const { customer_id, items } = req.body;
  const customer = await prisma.customer.findUnique({
    where: { id: customer_id },
  });
  if (!customer) return res.status(400).json({ error: "Customer not found" });

  const prods = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.product_id) } },
  });
  const prodsMap = new Map(prods.map((p) => [p.id, p]));
  const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });

  let subtotal = 0,
    discount_total = 0,
    total_bags = 0;
  const orderItemsData = [];
  for (const it of items) {
    const p = prodsMap.get(it.product_id);
    if (!p) continue;
    const qty = Number(it.qty_bags);
    total_bags += qty;
    const unitPrice = Number(p.price_per_bag);
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

  // status por defecto (si columna es enum usa enum, si no, string)
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
  }));
  const sch = await scheduleOrderForItems(enriched, new Date(), cfg);
  await prisma.order.update({
    where: { id: order.id },
    data: { scheduled_at: sch.scheduled_at, ready_at: sch.ready_at },
  });

  res.json({ order, estimated_delivery_at: sch.delivery_at });
});

// Actualizar estado de una orden
router.patch("/orders/:id", async (req, res) => {
  try {
    let { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "status requerido" });
    }
    const safe = toDbStatus(status);
    if (!safe) {
      return res
        .status(400)
        .json({ error: `status inválido. Use: ${CANON_STATUSES.join(", ")}` });
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: safe },
      include: { customer: true, items: true },
    });
    res.json(order);
  } catch (e) {
    console.error("PATCH /orders/:id error", e);
    res.status(500).json({ error: "Error actualizando estado" });
  }
});

// Marcar entregado
router.post("/orders/:id/markDelivered", async (req, res) => {
  const safe = toDbStatus("delivered");
  const o = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: safe },
  });
  res.json(o);
});

// Reportes
router.get("/reports/pendingByCustomer", async (req, res) => {
  // “Pendientes” en términos operativos
  const pendingSet = ["pending_payment", "processing", "ready"];
  const orders = await prisma.order.findMany({
    where: { status: { in: pendingSet } },
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
