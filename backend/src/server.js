import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db.js";
import { router as api } from "./routes.js";
import { sendText } from "./wa.js";
import { scheduleOrderForItems } from "./scheduler.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
app.get("/webhook", (req,res)=>{
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if(mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN){
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req,res)=>{
  try{
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if(!msg) return res.sendStatus(200);
    const from = msg.from;
    const text = msg.text?.body?.trim() || "";

    let customer = await prisma.customer.findUnique({ where: { whatsapp_phone: from } });
    if(!customer){
      await sendText(from, "¡Hola! Soy el asistente de Megaforza. Para crear tu cuenta envíanos: Nombre, NIT o Cédula y correo de facturación. Luego podrás adjuntar tu RUT y Certificado de Cámara de Comercio (≤30 días).");
      return res.sendStatus(200);
    }

    if(/[xX]\s*\d+/.test(text)){
      const pairs = text.split(/[;\n]+/);
      const items = [];
      for(const p of pairs){
        const m = p.match(/([A-Za-z0-9\-]+)\s*[xX]\s*(\d+)/);
        if(m){
          const sku = m[1].trim(); const qty = parseInt(m[2],10);
          const prod = await prisma.product.findUnique({ where: { sku } });
          if(prod){ items.push({ product_id: prod.id, qty_bags: qty, pelletized: prod.pelletized }); }
        }
      }
      if(items.length){
        const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
        const sch = await scheduleOrderForItems(items, new Date(), cfg);
        const prods = await prisma.product.findMany({ where: { id: { in: items.map(i=>i.product_id) } } });
        const map = new Map(prods.map(p=>[p.id,p]));
        let subtotal=0, discount_total=0, total_bags=0;
        const orderItemsData = [];
        for(const it of items){
          const p = map.get(it.product_id);
          const unit = Number(p.price_per_bag||0);
          const qty = it.qty_bags;
          total_bags += qty;
          const disc = Number(customer.discount_pct||0);
          subtotal += qty*unit;
          discount_total += qty*unit*disc/100;
          orderItemsData.push({ product_id: p.id, qty_bags: qty, unit_price: unit, discount_pct_applied: disc, line_total: qty*unit*(1-disc/100) });
        }
        const total = subtotal - discount_total;
        const order = await prisma.order.create({
          data: { customer_id: customer.id, status: 'pending_payment', total_bags, subtotal, discount_total, total, items: { create: orderItemsData }, scheduled_at: sch.scheduled_at, ready_at: sch.ready_at }
        });
        await sendText(from, `Tu pedido #${order.id.slice(0,8)} está pre-agendado. Total: $${total.toFixed(2)}. Envía el soporte de pago para confirmar. Entrega estimada: ${sch.delivery_at.toLocaleString('es-CO',{ timeZone:'America/Bogota'})}`);
        return res.sendStatus(200);
      }
    }

    await sendText(from, "Escribe tu pedido como: SKU x cantidad; SKU x cantidad (ej: LEC-18P x 1200; SUP-GAN x 300). También puedes pedir el *catálogo* o *estado de pedidos*.");
    return res.sendStatus(200);
  }catch(e){
    console.error(e);
    return res.sendStatus(200);
  }
});

app.use("/api", api);

const port = process.env.PORT || 3000;
app.listen(port, ()=>{
  console.log(`Backend running on http://localhost:${port}`);
});
