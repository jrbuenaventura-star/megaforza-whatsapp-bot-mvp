// backend/src/routes.js
import express from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { scheduleOrderForItems } from "./scheduler.js";

const upload = multer({ dest: "uploads/" });
export const router = express.Router();

/* ---------------------------- Helpers ---------------------------- */
function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function normalizeDocType(txt = "") {
  const t = String(txt)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (t === "cedula" || t === "cédula" || t === "1") return "CEDULA";
  if (t === "nit" || t === "2") return "NIT";
  return null;
}

/* Para mapear ?status= en /orders usando el enum real de Prisma */
const ORDER_STATUS_ENUM = Object.values(Prisma.OrderStatus);
const statusMap = new Map(ORDER_STATUS_ENUM.map((s) => [String(s).toLowerCase(), s]));

/* ------------------------ Rutas base / health ------------------------ */
router.get("/", (_req, res) => res.json({ ok: true, name: "Megaforza API" }));
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ----------------------------- Products ----------------------------- */
router.get("/products", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    res.json(products);
  } catch (e) {
    console.error("GET /products", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.patch("/products/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.price_per_bag != null) data.price_per_bag = toNum(req.body.price_per_bag);
    if (req.body.active != null) data.active = !!req.body.active;
    const p = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(p);
  } catch (e) {
    console.error("PATCH /products/:id", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------------- Capacity Config -------------------------- */
router.get("/config/capacity", async (_req, res) => {
  try {
    const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
    res.json(cfg);
  } catch (e) {
    console.error("GET /config/capacity", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/config/capacity", async (req, res) => {
  try {
    const data = req.body;
    const cfg = await prisma.capacityConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    res.json(cfg);
  } catch (e) {
    console.error("POST /config/capacity", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ------------------------------ Customers ------------------------------ */
router.get("/customers", async (req, res) => {
  try {
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
  } catch (e) {
    console.error("GET /customers", e);
    res.status(500).json({ ok: false, route: "/customers", error: String(e?.message || e) });
  }
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

      const finalDocType = normalizeDocType(doc_type);
      if (!finalDocType) return res.status(400).json({ ok: false, error: "doc_type inválido" });

      const rut = req.files?.rut?.[0]?.path || null;
      const cam = req.files?.camara?.[0]?.path || null;

      const c = await prisma.customer.create({
        data: {
          name,
          doc_type: finalDocType,
          doc_number,
          nit_dv,
          billing_email,
          whatsapp_phone,
          discount_pct: toNum(discount_pct, 0),
          rut_url: rut,
          camara_url: cam,
        },
      });
      res.json(c);
    } catch (e) {
      console.error("POST /customers", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

router.patch("/customers/:id", async (req, res) => {
  try {
    const c = await prisma.customer.update({
      where: { id: req.params.id },
      data: { discount_pct: toNum(req.body.discount_pct, 0) },
    });
    res.json(c);
  } catch (e) {
    console.error("PATCH /customers/:id", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------------------- Orders ------------------------------- */
router.get("/orders", async (req, res) => {
  try {
    const statusParam = (req.query.status || "").toString().toLowerCase();
    const enumValue = statusMap.get(statusParam); // null si no coincide
    const where = enumValue ? { status: enumValue } : {};

    const orders = await prisma.order.findMany({
      where,
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json(orders);
  } catch (e) {
    console.error("GET /orders error:", e);
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const { customer_id, items } = req.body;
    const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
    if (!customer) return res.status(400).json({ ok: false, error: "Customer not found" });

    const prods = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.product_id) } },
    });
    const prodsMap = new Map(prods.map((p) => [p.id, p]));
    const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });

    let subtotal = 0,
      discount_total = 0,
      total_bags = 0;
    const orderItemsData = [];
    const discountPct = toNum(customer.discount_pct, 0);

    for (const it of items) {
      const p = prodsMap.get(it.product_id);
      if (!p) continue;
      const qty = toNum(it.qty_bags, 0);
      const unitPrice = toNum(p.price_per_bag, 0);
      total_bags += qty;
      subtotal += qty * unitPrice;
      discount_total += qty * unitPrice * (discountPct / 100);
      orderItemsData.push({
        product_id: p.id,
        qty_bags: qty,
        unit_price: unitPrice,
        discount_pct_applied: discountPct,
        line_total: qty * unitPrice * (1 - discountPct / 100),
      });
    }

    const total = subtotal - discount_total;

    const order = await prisma.order.create({
      data: {
        customer_id,
        status: Prisma.OrderStatus.PENDING_PAYMENT,
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
  } catch (e) {
    console.error("POST /orders", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/orders/:id/markDelivered", async (req, res) => {
  try {
    const o = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: Prisma.OrderStatus.DELIVERED },
    });
    res.json(o);
  } catch (e) {
    console.error("POST /orders/:id/markDelivered", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------------------- Reports ------------------------------ */
// /api/reports/pendingByCustomer  → bultos pendientes por cliente/producto
router.get("/reports/pendingByCustomer", async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: { not: Prisma.OrderStatus.DELIVERED } }, // ✅ enum real
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { created_at: "asc" },
    });

    const rows = [];
    const byCust = new Map();

    for (const o of orders) {
      const cname = o.customer?.name || "—";
      if (!byCust.has(cname)) byCust.set(cname, new Map());
      const m = byCust.get(cname);

      for (const it of o.items) {
        const pname = it.product?.name || "—";
        const qty = Number(it.qty_bags || 0);
        m.set(pname, (m.get(pname) || 0) + qty);
      }
    }

    for (const [customer, prodMap] of byCust) {
      for (const [product, qty_bags] of prodMap) {
        rows.push({ customer, product, qty_bags });
      }
    }

    res.json(rows);
  } catch (e) {
    console.error("GET /reports/pendingByCustomer error:", e);
    res.status(500).json({
      ok: false,
      route: "/reports/pendingByCustomer",
      message: String(e?.message || e),
      code: e?.code || null,
    });
  }
});

// /api/reports/pendingByProduct → bultos pendientes por producto
router.get("/reports/pendingByProduct", async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: { not: Prisma.OrderStatus.DELIVERED } }, // ✅ enum real
      include: { items: { include: { product: true } } },
      orderBy: { created_at: "asc" },
    });

    const map = new Map(); // product -> qty
    for (const o of orders) {
      for (const it of o.items) {
        const pname = it.product?.name || "—";
        const qty = Number(it.qty_bags || 0);
        map.set(pname, (map.get(pname) || 0) + qty);
      }
    }

    const rows = Array.from(map, ([product, qty_bags]) => ({ product, qty_bags }));
    res.json(rows);
  } catch (e) {
    console.error("GET /reports/pendingByProduct error:", e);
    res.status(500).json({
      ok: false,
      route: "/reports/pendingByProduct",
      message: String(e?.message || e),
      code: e?.code || null,
    });
  }
});

/* --------------------------------- Diag -------------------------------- */
router.get("/__diag/db", async (_req, res) => {
  try {
    const one = await prisma.$queryRaw`select 1 as ok`;
    const count = await prisma.customer.count();
    res.json({ ok: true, ping: one, customer_count: count });
  } catch (e) {
    console.error("GET /__diag/db", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Enum real y conteo de pedidos (útiles para pruebas)
router.get("/__diag/order-enum", (_req, res) => {
  res.json({ ok: true, enum: ORDER_STATUS_ENUM });
});
router.get("/__diag/orders-count", async (_req, res) => {
  const count = await prisma.order.count();
  res.json({ ok: true, count });
});
