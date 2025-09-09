import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db.js";
import { router as api } from "./routes.js";
import { sendText } from "./wa.js";
import { scheduleOrderForItems } from "./scheduler.js";
import { Prisma, OrderStatus } from "@prisma/client";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0];
    const entry = change?.value;
    const msg = entry?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    // ─────────────────── Cliente ───────────────────
    let customer = await prisma.customer.findUnique({
      where: { whatsapp_phone: from },
    });
    if (!customer) {
      await sendText(
        from,
        "¡Hola! Soy el asistente de Megaforza. Para crear tu cuenta envíanos: Nombre, NIT o Cédula y correo de facturación. Luego podrás adjuntar tu RUT y Certificado de Cámara de Comercio (≤30 días)."
      );
      return res.sendStatus(200);
    }

    // Status seguro (enum MAYÚSCULAS, minúsculas o string fallback)
    const statusEnum = Prisma?.OrderStatus ?? OrderStatus ?? {};
    const SAFE_STATUS =
      statusEnum.PENDING_PAYMENT ?? // enum MAYÚSCULAS
      statusEnum.pending_payment ?? // enum minúsculas (si vino de introspección)
      "pending_payment";            // string fallback compatible

    // ───────────── Pedidos desde CATÁLOGO ─────────────
    if (msg?.type === "order") {
      const productItems = msg.order?.product_items || [];
      if (productItems.length === 0) {
        await sendText(
          from,
          "No recibí productos en el pedido. Abre el 🛍️ catálogo y vuelve a enviarlo."
        );
        return res.sendStatus(200);
      }

      const skus = productItems.map((i) => i.product_retailer_id);
      const products = await prisma.product.findMany({
        where: { sku: { in: skus } },
      });
      const pMap = new Map(products.map((p) => [p.sku, p]));

      const disc = Number(customer.discount_pct || 0);
      let total_bags = 0;
      const enrichedForSchedule = [];
      const orderItemsData = [];

      for (const it of productItems) {
        const p = pMap.get(it.product_retailer_id);
        const qty = Number(it.quantity || 0);
        if (!p || !qty) continue;

        total_bags += qty;
        const unit = Number(p.price_per_bag || 0);
        const line_total = qty * unit * (1 - disc / 100);

        enrichedForSchedule.push({
          qty_bags: qty,
          pelletized: !!p.pelletized,
        });
        orderItemsData.push({
            product_id: p.id,
            qty_bags: qty,
            unit_price: unit,
            discount_pct_applied: disc,
            line_total,
        });
      }

      if (!orderItemsData.length) {
        await sendText(
          from,
          "No pude reconocer los productos del catálogo. Verifica los SKUs y vuelve a intentar."
        );
        return res.sendStatus(200);
      }

      const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
      const sch = await scheduleOrderForItems(
        enrichedForSchedule,
        new Date(),
        cfg
      );

      const total = orderItemsData.reduce((s, i) => s + Number(i.line_total), 0);

      const order = await prisma.order.create({
        data: {
          customer_id: customer.id,
          status: SAFE_STATUS,
          total_bags,
          total,
          items: { create: orderItemsData },
          scheduled_at: sch.scheduled_at,
          ready_at: sch.ready_at,
        },
      });

      const fmtCOP = (n) =>
        Number(n).toLocaleString("es-CO", {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        });

      const eta =
        (sch.delivery_at || sch.ready_at).toLocaleString("es-CO", {
          timeZone: "America/Bogota",
        });

      await sendText(
        from,
        `Pedido #${order.id.slice(
          0,
          8
        )} recibido desde catálogo.\nTotal: ${fmtCOP(
          total
        )}\nEntrega estimada: ${eta}\nPor favor realiza el pago y envía el comprobante para confirmar.`
      );

      return res.sendStatus(200); // ← evita caer al fallback
    }

    // ───────────── Pedidos por TEXTO (opcional) ─────────────
    const text = msg.text?.body?.trim() || "";
    if (msg?.type === "text" && /[xX]\s*\d+/.test(text)) {
      const pairs = text.split(/[;\n]+/);
      const items = [];
      for (const p of pairs) {
        const m = p.match(/([A-Za-z0-9\-]+)\s*[xX]\s*(\d+)/);
        if (m) {
          const sku = m[1].trim();
          const qty = parseInt(m[2], 10);
          const prod = await prisma.product.findUnique({ where: { sku } });
          if (prod) {
            items.push({
              product_id: prod.id,
              qty_bags: qty,
              pelletized: prod.pelletized,
            });
          }
        }
      }

      if (items.length) {
        const cfg = await prisma.capacityConfig.findUnique({ where: { id: 1 } });
        const sch = await scheduleOrderForItems(items, new Date(), cfg);

        const prods = await prisma.product.findMany({
          where: { id: { in: items.map((i) => i.product_id) } },
        });
        const map = new Map(prods.map((p) => [p.id, p]));
        const disc = Number(customer.discount_pct || 0);

        let total_bags = 0;
        const orderItemsData = [];
        for (const it of items) {
          const p = map.get(it.product_id);
          const unit = Number(p.price_per_bag || 0);
          const qty = it.qty_bags;
          total_bags += qty;
          const line_total = qty * unit * (1 - disc / 100);
          orderItemsData.push({
            product_id: p.id,
            qty_bags: qty,
            unit_price: unit,
            discount_pct_applied: disc,
            line_total,
          });
        }

        const total = orderItemsData.reduce(
          (s, i) => s + Number(i.line_total),
          0
        );

        const order = await prisma.order.create({
          data: {
            customer_id: customer.id,
            status: SAFE_STATUS, // ← aquí también usamos el status robusto
            total_bags,
            total,
            items: { create: orderItemsData },
            scheduled_at: sch.scheduled_at,
            ready_at: sch.ready_at,
          },
        });

        const fmtCOP = (n) =>
          Number(n).toLocaleString("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0,
          });

        await sendText(
          from,
          `Tu pedido #${order.id.slice(
            0,
            8
          )} está pre-agendado. Total: ${fmtCOP(
            total
          )}. Entrega estimada: ${(sch.delivery_at || sch.ready_at).toLocaleString(
            "es-CO",
            { timeZone: "America/Bogota" }
          )}. Envía el soporte de pago para confirmar.`
        );
        return res.sendStatus(200);
      }
    }

    // ───────────── Fallback SOLO texto ─────────────
    if (msg?.type === "text") {
      const low = text.toLowerCase();
      if (["catalogo", "catálogo", "menu", "menú"].includes(low)) {
        await sendText(
          from,
          "Toca el ícono de tienda 🛍️ y envía el pedido desde el catálogo."
        );
      } else {
        await sendText(
          from,
          "Escribe tu pedido como: SKU x cantidad (ej: LEC-18P x 1200). También puedes pedir el *catálogo* o *estado de pedidos*."
        );
      }
      return res.sendStatus(200);
    }

    // Otros tipos: ignorar
    return res.sendStatus(200);
  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
  }
});

app.use("/api", api);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
