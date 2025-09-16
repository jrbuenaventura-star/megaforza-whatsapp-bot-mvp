
// backend/src/server.js
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

// ───────────────────── Utilidades ─────────────────────
const fmtCOP = (n) =>
  Number(n).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

/**
/**
 * Regla de negocio:
 * - Si la hora en Bogotá es > 16:30, mover la entrega al día siguiente a las 08:00 (Bogotá).
 * - Si no, dejar la hora tal cual.
 * Nota: Bogotá está en UTC-5 (sin DST). 08:00 BOG = 13:00 UTC.
 */
function etaTextBogotaNextDayIfAfter1630(dateLike) {
  const fmtParts = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dateLike);

  const get = (t) => fmtParts.find((p) => p.type === t)?.value;

  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  const hour = parseInt(get("hour") || "0", 10);
  const minute = parseInt(get("minute") || "0", 10);

  const after1630 = hour > 16 || (hour === 16 && minute > 30);

  const outDate = after1630
    // Siguiente día a las 08:00 Bogotá → 13:00 UTC
    ? new Date(Date.UTC(year, month - 1, day + 1, 13, 0, 0))
    // Dejar igual
    : new Date(dateLike);

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(outDate);
}

/** Resuelve el enum de estado “pendiente de pago” de forma segura */
function getSafePendingStatus() {
  const S = Prisma?.OrderStatus ?? OrderStatus ?? {};
  return S.PENDING_PAYMENT ?? S.pending_payment ?? "pending_payment";
}

// ───────────────────── Webhook VERIFY ─────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ───────────────────── Webhook RECEIVE ─────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0];
    const entry = change?.value;
    const msg = entry?.messages?.[0];

    // No hay mensaje (p. ej., son solo statuses)
    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    // ───────────── Cliente ─────────────
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
      const SAFE_STATUS = getSafePendingStatus();

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

const etaSource = sch.delivery_at ?? sch.ready_at ?? new Date();
const etaTxt = etaTextBogotaNextDayIfAfter1630(etaSource);

      await sendText(
        from,
        `Pedido #${order.id.slice(0, 8)} recibido desde catálogo.\n` +
          `Total: ${fmtCOP(total)}\n` +
          `Entrega estimada: ${etaTxt}\n` +
          `Por favor realiza el pago y envía el comprobante para confirmar.`
      );

      return res.sendStatus(200); // ← evita caer al fallback
    }

    // ───────────── Pedidos por TEXTO ─────────────
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

        const total = orderItemsData.reduce((s, i) => s + Number(i.line_total), 0);
        const SAFE_STATUS = getSafePendingStatus();

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

const etaSource = sch.delivery_at ?? sch.ready_at ?? new Date();
const etaTxt = etaTextBogotaNextDayIfAfter1630(etaSource);

        await sendText(
          from,
          `Tu pedido #${order.id.slice(0, 8)} está pre-agendado.\n` +
            `Total: ${fmtCOP(total)}.\n` +
            `Entrega estimada: ${etaTxt}.\n` +
            `Envía el soporte de pago para confirmar.`
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

// ───────────────────── API ─────────────────────
app.use("/api", api);

// ───────────────────── Boot ─────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
