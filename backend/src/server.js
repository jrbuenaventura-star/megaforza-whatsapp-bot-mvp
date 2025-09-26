// backend/src/server.js
import express from "express";
import cors from "cors";

import { prisma } from "./db.js";
import { router as api } from "./routes.js";
import { scheduleOrderForItems } from "./scheduler.js";

/* ========= ENV ========= */
const {
  PORT = 3000,

  // WhatsApp Cloud API
  WHATSAPP_ACCESS_TOKEN,          // Bearer
  WHATSAPP_BUSINESS_NUMBER,       // phone_number_id (ej: 123456789012345)
  WHATSAPP_VERIFY_TOKEN,          // para GET /webhook verificación
  WHATSAPP_CATALOG_ID,            // catalog_id (para product_list)

  // Derivaciones
  AGENT_CARTERA = "573105898098",
  AGENT_TECNICO = "573182705499",
  AGENT_RECEPCION = "573102132294",
} = process.env;

/* ========= APP ========= */
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Logger simple (para evitar dependencia morgan)
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Monta API REST
app.use("/api", api);

/* ========= Sesiones simples en memoria ========= */
const sessions = new Map();
// Estructura típica:
// sessions.set(waId, { state: "...", draft: { ... } })
// States: MENU, REG_NAME, REG_TAX, REG_EMAIL, REG_RUT, ORDER_SKU

/* ========= Helpers WhatsApp ========= */
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

/* ========= Menú principal ========= */
async function sendMenu(waId) {
  const msg =
`👉 Gracias por comunicarte con Megaforza 🐄💪
Por favor indícanos qué servicio requieres:

1️⃣ Pedidos 📝
2️⃣ Cartera 💰
3️⃣ Comunicarte con un asesor técnico 👩‍💼👨‍💼
4️⃣ Comunicarte con recepción ☎️

Escribe el número de la opción que deseas.`;
  await sendText(waId, msg);
}

async function pushCatalog(waId) {
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

/* ========= Onboarding (finalizar) ========= */
async function finalizeRegistration(waId, session) {
  const name          = (session.draft.name || "").trim();
  const billing_email = (session.draft.billing_email || "").trim();
  const doc_number    = (session.draft.tax_id || "").trim();
  const doc_type      = session.draft.doc_type || "CEDULA"; // por defecto

  await prisma.customer.upsert({
    where:  { whatsapp_phone: waId },
    update: { name, billing_email, doc_number, doc_type },
    create: { name, whatsapp_phone: waId, billing_email, doc_number, doc_type },
  });

  await sendText(
    waId,
    `¡Listo, ${name}! Ya quedaste registrado ✅\n` +
    `Puedes hacer tu pedido desde el catálogo o escribiendo SKU y cantidad.\n\n` +
    `Te envié el catálogo a continuación.`
  );
  await pushCatalog(waId);

  // Ofrece también modo SKU
  await sendText(
    waId,
    `Si prefieres escribir tu pedido:\n` +
    `• Envía una línea por producto: "SKU cantidad"\n` +
    `• Ejemplos:\n` +
    `   AVI 10\n` +
    `   AVI-1T 2   (cada 1T equivale a 25 bultos)\n` +
    `Cuando termines, escribe "lista".`
  );
  sessions.set(waId, { state: "ORDER_SKU", draft: {} });
}

/* ========= Pedido por Catálogo de WhatsApp ========= */
async function handleCatalogOrder(waId, msg) {
  const orderItems = msg.order?.product_items || [];

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
  const bySKU = new Map(dbProducts.map((p) => [p.sku, p]));

  // Construir items para BD
  const itemsForDb = [];
  for (const it of orderItems) {
    const p = bySKU.get(it.product_retailer_id);
    if (!p) continue;
    const qtyWhatsApp = Number(it.quantity || 0);
    const bags = p.sku?.endsWith("1T") ? qtyWhatsApp * 25 : qtyWhatsApp;

    itemsForDb.push({
      product_id: p.id,
      qty_bags: bags,
      unit_price_cop: Number(p.price_per_bag),
    });
  }

  if (itemsForDb.length === 0) {
    await sendText(waId, "No pudimos reconocer productos del catálogo. ¿Puedes intentar nuevamente?");
    return;
  }

  // Totales con descuento del cliente
  const subtotal = itemsForDb.reduce((s, it) => s + Number(it.qty_bags) * Number(it.unit_price_cop), 0);
  const discountPct = Number(customer.discount_pct || 0);
  const discountTotal = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountTotal;

  // Items enriquecidos para scheduler
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

  // Configuración con sábado hasta 12:00
  const schedCfg = {
    timezone: "America/Bogota",
    workdays: "Mon,Tue,Wed,Thu,Fri,Sat",
    workday_start: "08:00",
    workday_end: "17:00",
    dispatch_buffer_min: 60,
    pellet_bph: 80,
    non_pellet_bph: 80,
    sat_workday_start: "08:00",
    sat_workday_end: "12:00", // <- sábado hasta el mediodía
    sat_pellet_bph: 60,
    sat_non_pellet_bph: 60,
  };

  const sch = await scheduleOrderForItems(richItems, new Date(), schedCfg);

  const created = await prisma.order.create({
    data: {
      customer_id: customer.id,
      status: "pending_payment",
      scheduled_at: sch.scheduled_at,
      ready_at: sch.ready_at,
      subtotal_cop: subtotal,
      discount_total_cop: discountTotal,
      total_cop: total,
      items: { createMany: { data: itemsForDb } },
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

/* ========= Pedido por texto (SKU + cantidad) ========= */
function parseSkuLines(text) {
  // Acepta líneas tipo: "AVI 10", "AVI-1T 2", "AVI x10", "AVI * 10"
  const lines = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const pairs = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9._-]+)\s*(?:x|\*)?\s*(\d+)$/i);
    if (m) {
      pairs.push({ sku: m[1], qty: Number(m[2]) });
    }
  }
  return pairs;
}

async function handleSkuOrder(waId, text) {
  const pairs = parseSkuLines(text);
  if (!pairs.length) {
    await sendText(waId, "No reconocí ninguna línea con formato \"SKU cantidad\". Ej: AVI 10");
    return;
  }

  // Productos de BD
  const skus = pairs.map(p => p.sku);
  const dbProds = await prisma.product.findMany({ where: { sku: { in: skus } } });
  const bySku = new Map(dbProds.map(p => [p.sku, p]));

  const notFound = pairs.filter(p => !bySku.has(p.sku)).map(p => p.sku);
  if (notFound.length) {
    await sendText(waId, `Estos SKU no existen o no están activos: ${notFound.join(", ")}`);
    return;
  }

  // Cliente
  let customer = await prisma.customer.findUnique({ where: { whatsapp_phone: waId } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: waId,
        whatsapp_phone: waId,
        doc_type: "CEDULA",
        doc_number: "",
      },
    });
  }

  // Items a guardar
  const itemsForDb = [];
  const richItems = [];
  for (const { sku, qty } of pairs) {
    const p = bySku.get(sku);
    const bags = sku.endsWith("1T") ? qty * 25 : qty;
    itemsForDb.push({
      product_id: p.id,
      qty_bags: bags,
      unit_price_cop: Number(p.price_per_bag),
    });
    richItems.push({
      product_id: p.id,
      pelletized: !!p.pelletized,
      qty_bags: bags,
    });
  }

  const subtotal = itemsForDb.reduce((s, it) => s + Number(it.qty_bags) * Number(it.unit_price_cop), 0);
  const discountPct = Number(customer.discount_pct || 0);
  const discountTotal = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountTotal;

  const schedCfg = {
    timezone: "America/Bogota",
    workdays: "Mon,Tue,Wed,Thu,Fri,Sat",
    workday_start: "08:00",
    workday_end: "17:00",
    dispatch_buffer_min: 60,
    pellet_bph: 80,
    non_pellet_bph: 80,
    sat_workday_start: "08:00",
    sat_workday_end: "12:00",
    sat_pellet_bph: 60,
    sat_non_pellet_bph: 60,
  };
  const sch = await scheduleOrderForItems(richItems, new Date(), schedCfg);

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
      items: { createMany: { data: itemsForDb } },
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

  // Cierra modo ORDER_SKU
  sessions.delete(waId);
}

/* ========= Enrutamiento de opciones 2/3/4 ========= */
async function handoff(waId, area, targetNumber) {
  const links = `https://wa.me/${targetNumber}`;
  const txt = {
    cartera:  "👉 En breve te comunicaremos con el área de cartera para resolver tu solicitud.\n\nAbre el chat aquí:\n" + links,
    tecnico:  "👉 En breve te comunicaremos con un asesor técnico de Megaforza.\n\nAbre el chat aquí:\n" + links,
    recepcion:"👉 En breve te comunicaremos con recepción.\n\nAbre el chat aquí:\n" + links,
  }[area];

  await sendText(waId, txt);

  // Aviso al interno (best-effort)
  await sendText(
    targetNumber,
    `Nuevo contacto desde el bot:\n` +
    `Cliente WA: ${waId}\n` +
    `Área: ${area}\n` +
    `Escríbele directamente cuando puedas.`
  );

  // Cerrar sesión
  sessions.delete(waId);
}

/* ========= GET /webhook (verificación Meta) ========= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ========= POST /webhook (mensajes entrantes) ========= */
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
          const type = msg.type;

          // 0) Pedido desde catálogo
          if (type === "order" && msg.order?.product_items?.length) {
            await handleCatalogOrder(waId, msg);
            continue;
          }

          // 1) Adjuntos para RUT en onboarding
          if ((type === "image" || type === "document")) {
            const session = sessions.get(waId);
            if (session?.state === "REG_RUT") {
              // Guardamos el media_id en memoria (si deseas persistir, agrega columna en BD)
              session.draft.rut_media_id = msg.image?.id || msg.document?.id || null;
              await finalizeRegistration(waId, session);
              sessions.delete(waId);
              continue;
            }
          }

          // 2) Texto: menú, onboarding, pedidos por SKU
          if (type === "text") {
            const t = (msg.text?.body || "").trim();
            const session = sessions.get(waId) || { state: null, draft: {} };

            // 2.a Modo ORDER_SKU
            if (session.state === "ORDER_SKU") {
              if (/^lista$/i.test(t)) {
                await sendText(waId, "Envía las líneas \"SKU cantidad\" antes de escribir \"lista\" 😉");
                continue;
              }
              await handleSkuOrder(waId, t);
              continue;
            }

            // 2.b Onboarding
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
              session.draft.billing_email = t;
              session.state = "REG_RUT";
              sessions.set(waId, session);
              await sendText(
                waId,
                "Para finalizar, por favor adjunta **foto o PDF de tu RUT** (puedes escribir *omitir* para continuar sin adjuntarlo)."
              );
              continue;
            }

            if (session.state === "REG_RUT") {
              if (/^omitir$/i.test(t)) {
                await finalizeRegistration(waId, session);
                sessions.delete(waId);
              } else {
                await sendText(waId, "Necesito que adjuntes una **imagen o PDF** del RUT, o escribe *omitir* para continuar.");
              }
              continue;
            }

            // 2.c Selección de menú (siempre disponible cuando no hay sesión)
            if (/^(men[uú]|hola)$/i.test(t) || !session.state) {
              // Números 1..4
              const m = t.match(/^\s*([1-4])\s*$/);
              if (m) {
                const opt = m[1];
                if (opt === "1") {
                  // Pedidos
                  const existing = await prisma.customer.findUnique({ where: { whatsapp_phone: waId } });
                  if (existing) {
                    await sendText(
                      waId,
                      "Perfecto. Te envié el **catálogo** para que armes tu pedido.\n" +
                      "Si prefieres, también puedes **escribir SKU y cantidad** (una línea por producto). " +
                      "Ej: `AVI 10` o `AVI-1T 2` (1T = 25 bultos). Cuando termines, escribe *lista*."
                    );
                    await pushCatalog(waId);
                    sessions.set(waId, { state: "ORDER_SKU", draft: {} });
                  } else {
                    // Inicia onboarding
                    sessions.set(waId, { state: "REG_NAME", draft: {} });
                    await sendText(waId, "Para registrarte, por favor dime tu nombre o el de tu empresa.");
                  }
                  continue;
                }
                if (opt === "2") {
                  await handoff(waId, "cartera", AGENT_CARTERA);
                  continue;
                }
                if (opt === "3") {
                  await handoff(waId, "tecnico", AGENT_TECNICO);
                  continue;
                }
                if (opt === "4") {
                  await handoff(waId, "recepcion", AGENT_RECEPCION);
                  continue;
                }
              }

              // Si no mandó un número (o dijo hola/menú), mostrar menú
              await sendMenu(waId);
              sessions.set(waId, { state: "MENU", draft: {} });
              continue;
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

/* ========= Arrancar ========= */
app.listen(PORT, () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
