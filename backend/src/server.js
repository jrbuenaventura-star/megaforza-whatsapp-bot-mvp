// backend/src/server.js
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { prisma } from "./db.js";
import { router as api } from "./routes.js";
import { scheduleOrderForItems } from "./scheduler.js";

// ====== ENV ======
const {
  PORT = 3000,

  // WhatsApp Cloud API
  WHATSAPP_ACCESS_TOKEN,         // Bearer
  WHATSAPP_BUSINESS_NUMBER,      // phone_number_id (ej: 123456789012345)
  WHATSAPP_VERIFY_TOKEN,         // para GET /webhook verificación
  WHATSAPP_CATALOG_ID,           // catalog_id (para product_list)

  // Opcional: webhook propio para sync de catálogo
  WA_CATALOG_SYNC_URL,
} = process.env;

// ====== APP ======
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// Monta API REST
app.use("/api", api);

// ====== Sesiones simples en memoria (onboarding) ======
const sessions = new Map();
// session = {
//   state: "REG_NAME" | "REG_TAX" | "REG_EMAIL" | null,
//   draft: { name, tax_id, billing_email, doc_type? },
// }

// ====== Helpers de WhatsApp ======
async function sendText(to, text) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_NUMBER) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_BUSINESS_NUMBER}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      }),
    });
  } catch (e) {
    console.error("sendText error:", e?.message || e);
  }
}

async function sendInteractiveButtons(to, bodyText, buttons) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_NUMBER) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_BUSINESS_NUMBER}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      }),
    });
  } catch (e) {
    console.error("sendInteractiveButtons error:", e?.message || e);
  }
}

async function sendInteractiveProductList(to, catalog_id, product_items) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_NUMBER || !catalog_id) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_BUSINESS_NUMBER}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "product_list",
          header: { type: "text", text: "Catálogo Megaforza" },
          body: { text: "Selecciona tus productos y cantidades." },
          action: { catalog_id, product_items },
        },
      }),
    });
  } catch (e) {
    console.error("sendInteractiveProductList error:", e?.message || e);
  }
}

// ====== GET /webhook (verificación) ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ====== POST /webhook (mensajes entrantes) ======
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body?.object !== "whatsapp_business_account") {
      return res.sendStatus(200);
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];

        const waId = contacts?.[0]?.wa_id || messages?.[0]?.from;
        if (!waId) continue;

        for (const msg of messages) {
          // 1) Order desde catálogo
          if (msg.type === "order" && msg.order?.product_items?.length) {
            await handleCatalogOrder(waId, msg);
            continue;
          }

          // 2) Onboarding con botones
          if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
            const id = msg.interactive?.button_reply?.id;
            if (id === "PEDIR") {
              // Inicia registro si no existe cliente
              const existing = await prisma.customer.findUnique({
                where: { whatsapp_phone: waId },
              });
              if (existing) {
                // Ya está registrado ⇒ envía catálogo
                await pushCatalog(waId);
              } else {
                // Arrancar flujo de registro sin saludo genérico
                sessions.set(waId, { state: "REG_NAME", draft: {} });
                await sendText(
                  waId,
                  "Para registrarte, por favor dime tu nombre o el de tu empresa."
                );
              }
            }
            continue;
          }

          // 3) Onboarding por texto clásico
          if (msg.type === "text") {
            const t = (msg.text?.body || "").trim();

            const session = sessions.get(waId) || { state: null, draft: {} };

            if (session.state === "REG_NAME") {
              session.draft.name = t;
              session.state = "REG_TAX";
              sessions.set(waId, session);
              await sendText(waId, "Perfecto. Ahora, ¿tu NIT o cédula?");
              continue;
            }

            if (session.state === "REG_TAX") {
              session.draft.tax_id = t;
              session.state = "REG_EMAIL";
              sessions.set(waId, session);
              await sendText(waId, "Gracias. Por último, ¿tu correo de facturación?");
              continue;
            }

            if (session.state === "REG_EMAIL") {
              // Guardar registro y enviar catálogo
              session.draft.billing_email = t;
              const name = (session.draft.name || "").trim();
              const billing_email = (session.draft.billing_email || "").trim();
              const doc_number = (session.draft.tax_id || "").trim();
              const doc_type = session.draft.doc_type || "CEDULA";

              await prisma.customer.upsert({
                where: { whatsapp_phone: waId },
                update: { name, billing_email, doc_number, doc_type },
                create: { name, whatsapp_phone: waId, billing_email, doc_number, doc_type },
              });

              await sendText(
                waId,
                `¡Listo, ${name}! Ya quedaste registrado ✅\nAhora puedes hacer tu pedido desde nuestro catálogo.`
              );
              await pushCatalog(waId);

              sessions.delete(waId);
              // Evita que caiga en otro saludo
              continue;
            }

            // Si no hay sesión y escribe algo, ofrece botón “Hacer pedido”
            // (sin el saludo largo que pediste remover)
            if (!session.state) {
              await sendInteractiveButtons(waId, "¿Qué deseas hacer?", [
                { id: "PEDIR", title: "Hacer pedido" },
              ]);
            }
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.message || err);
    res.sendStatus(200);
  }
});

// ====== helpers específicos ======
async function pushCatalog(waId) {
  // Intenta construir hasta 30 items activos por SKU
  try {
    const prods = await prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 30,
    });
    const items = prods.map((p) => ({ product_retailer_id: p.sku }));
    await sendInteractiveProductList(waId, WHATSAPP_CATALOG_ID, items);
  } catch (e) {
    console.error("pushCatalog error:", e?.message || e);
  }
}

// Crea un pedido a partir de un mensaje de tipo order del Catálogo de WhatsApp
async function handleCatalogOrder(waId, msg) {
  // Estructura: msg.order.product_items: [{ product_retailer_id, quantity, item_price, currency }]
  const orderItems = msg.order.product_items || [];

  // Cliente (si no existe, crea mínimo con phone)
  let customer = await prisma.customer.findUnique({ where: { whatsapp_phone: waId } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: waId, // provisional
        whatsapp_phone: waId,
        doc_type: "CEDULA",
        doc_number: "",
      },
    });
  }

  // Cargar productos por SKU
  const skuList = orderItems.map((i) => i.product_retailer_id).filter(Boolean);
  const dbProducts = await prisma.product.findMany({ where: { sku: { in: skuList } } });

  // Map SKU → producto
  const bySKU = new Map(dbProducts.map((p) => [p.sku, p]));

  // Construir items de DB
  const itemsForDb = [];
  for (const it of orderItems) {
    const p = bySKU.get(it.product_retailer_id);
    if (!p) continue;
    const qtyWhatsApp = Number(it.quantity || 0);

    // Para almacenamiento: qty_bags = bultos. 1T ⇒ 25 bultos * cantidad
    const bags = p.sku?.endsWith("1T") ? qtyWhatsApp * 25 : qtyWhatsApp;

    itemsForDb.push({
      product_id: p.id,
      qty_bags: bags,
      unit_price_cop: Number(p.price_per_bag), // guardar entero COP
    });
  }

  if (itemsForDb.length === 0) {
    await sendText(waId, "No pudimos reconocer productos del catálogo. ¿Puedes intentar nuevamente?");
    return;
  }

  // Totales
  const subtotal = itemsForDb.reduce(
    (s, it) => s + Number(it.qty_bags) * Number(it.unit_price_cop),
    0
  );
  const discountPct = Number(customer.discount_pct || 0);
  const discountTotal = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountTotal;

  // Scheduling (usa productos y si son pelletizados)
  const richItems = [];
  for (const it of itemsForDb) {
    const prod = dbProducts.find((p) => p.id === it.product_id);
    if (!prod) continue;
    richItems.push({
      product_id: prod.id,
      pelletized: !!prod.pelletized,
      qty_bags: it.qty_bags,
    });
  }

  // Configuración por defecto (ajústala si tienes tabla/config en BD)
  const schedCfg = {
    timezone: "America/Bogota",
    workdays: "Mon,Tue,Wed,Thu,Fri,Sat",
    workday_start: "08:00",
    workday_end: "17:00",
    dispatch_buffer_min: 60,
    pellet_bph: 80,
    non_pellet_bph: 80,
    // variantes sábado (opcional):
    sat_workday_start: "08:00",
    sat_workday_end: "11:00",
    sat_pellet_bph: 60,
    sat_non_pellet_bph: 60,
  };

  const sch = await scheduleOrderForItems(richItems, new Date(), schedCfg);

  // Crear pedido en estado inicial = pending_payment
  const created = await prisma.order.create({
    data: {
      customer_id: customer.id,
      status: "pending_payment",
      scheduled_at: sch.scheduled_at,
      ready_at: sch.ready_at,
      delivery_at: sch.delivery_at,
      subtotal_cop: subtotal,
      discount_total_cop: discountTotal,
      total_cop: total,
      items: {
        createMany: {
          data: itemsForDb,
        },
      },
    },
    include: { items: true, customer: true },
  });

  await sendText(
    waId,
    `Pedido recibido ✅\n` +
      `Subtotal: $${subtotal.toLocaleString("es-CO")}\n` +
      (discountTotal > 0 ? `Descuento: $${discountTotal.toLocaleString("es-CO")}\n` : "") +
      `Total: $${total.toLocaleString("es-CO")}\n` +
      `Entrega estimada: ${new Date(created.delivery_at).toLocaleString("es-CO")}`
  );
}

// ====== Arrancar ======
app.listen(PORT, () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
