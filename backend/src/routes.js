import express from "express";
import multer from "multer";
import { prisma } from "./db.js";
import { scheduleOrderForItems } from "./scheduler.js";
const upload = multer({ dest: "uploads/" });

export const router = express.Router();

router.get("/health", (req,res)=> res.json({ ok:true }));

router.get("/products", async (req,res)=>{
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  res.json(products);
});
router.patch("/products/:id", async (req,res)=>{
  const { price_per_bag, active } = req.body;
  const p = await prisma.product.update({ where: { id: req.params.id }, data: { price_per_bag, active } });
  res.json(p);
});

router.get("/config/capacity", async (req,res)=>{
  const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
  res.json(cfg);
});
router.post("/config/capacity", async (req,res)=>{
  const data = req.body;
  const cfg = await prisma.capacityConfig.upsert({ where:{ id:1 }, update: data, create: { id:1, ...data }});
  res.json(cfg);
});

router.get("/customers", async (req,res)=>{
  const q = req.query.q?.toString() || "";
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { whatsapp_phone: { contains: q } },
        { doc_number: { contains: q } }
      ]
    },
    orderBy: { created_at: 'desc' }
  });
  res.json(customers);
});
router.post("/customers", upload.fields([{ name:'rut' }, { name:'camara' }]), async (req,res)=>{
  const { name, doc_type, doc_number, nit_dv, billing_email, whatsapp_phone, discount_pct } = req.body;
  const rut = req.files?.rut?.[0]?.path || null;
  const cam = req.files?.camara?.[0]?.path || null;
  const c = await prisma.customer.create({
    data: { name, doc_type, doc_number, nit_dv, billing_email, whatsapp_phone, discount_pct: Number(discount_pct||0), rut_url: rut, camara_url: cam }
  });
  res.json(c);
});
router.patch("/customers/:id", async (req,res)=>{
  const { discount_pct } = req.body;
  const c = await prisma.customer.update({ where: { id: req.params.id }, data: { discount_pct: Number(discount_pct||0) } });
  res.json(c);
});

router.get("/orders", async (req,res)=>{
  const status = req.query.status?.toString();
  const where = status ? { status } : {};
  const orders = await prisma.order.findMany({ where, include: { customer:true, items: { include: { product:true } } }, orderBy: { created_at: 'desc' } });
  res.json(orders);
});
router.post("/orders", async (req,res)=>{
  const { customer_id, items } = req.body;
  const customer = await prisma.customer.findUnique({ where: { id: customer_id }});
  if(!customer) return res.status(400).json({ error: "Customer not found" });

  const prods = await prisma.product.findMany({ where: { id: { in: items.map(i=>i.product_id) } } });
  const prodsMap = new Map(prods.map(p=>[p.id,p]));
  const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });

  let subtotal = 0, discount_total = 0, total_bags = 0;
  const orderItemsData = [];
  for(const it of items){
    const p = prodsMap.get(it.product_id);
    if(!p) continue;
    const qty = Number(it.qty_bags);
    total_bags += qty;
    const unitPrice = Number(p.price_per_bag);
    const discountPct = Number(customer.discount_pct||0);
    const line = qty * unitPrice * (1 - discountPct/100);
    subtotal += qty * unitPrice;
    discount_total += qty * unitPrice * (discountPct/100);
    orderItemsData.push({
      product_id: p.id,
      qty_bags: qty,
      unit_price: unitPrice,
      discount_pct_applied: discountPct,
      line_total: line
    });
  }
  const total = subtotal - discount_total;

  const order = await prisma.order.create({
    data: { customer_id, status: 'pending_payment', total_bags, subtotal, discount_total, total, items: { create: orderItemsData } },
    include: { items: { include: { product: true } } }
  });

  const enriched = order.items.map(i=>({ qty_bags: i.qty_bags, pelletized: i.product.pelletized }));
  const sch = await scheduleOrderForItems(enriched, new Date(), cfg);
  await prisma.order.update({ where: { id: order.id }, data: { scheduled_at: sch.scheduled_at, ready_at: sch.ready_at } });

  res.json({ order, estimated_delivery_at: sch.delivery_at });
});
router.post("/orders/:id/markDelivered", async (req,res)=>{
  const o = await prisma.order.update({ where: { id: req.params.id }, data: { status: 'delivered' } });
  res.json(o);
});

router.get("/reports/pendingByCustomer", async (req,res)=>{
  const orders = await prisma.order.findMany({
    where: { status: { in: ['pending_payment','paid','scheduled','in_production'] } },
    include: { customer:true, items: { include: { product: true } } },
    orderBy: { created_at: 'asc' }
  });
  const report = {};
  for(const o of orders){
    const cust = o.customer.name;
    if(!report[cust]) report[cust] = {};
    for(const it of o.items){
      const prod = it.product.name;
      report[cust][prod] = (report[cust][prod]||0) + it.qty_bags;
    }
  }
  res.json(report);
});
