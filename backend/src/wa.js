
const GRAPH = "https://graph.facebook.com/v20.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;

function normalizeTo(n) {
  return String(n || "").replace(/[^\d]/g, "");
}

async function callGraph(payload) {
  if (!PHONE_ID || !TOKEN) {
    console.error("Faltan WHATSAPP_PHONE_ID o WHATSAPP_ACCESS_TOKEN");
    return;
  }
  const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("WA error:", res.status, await res.text());
  }
}

// Texto (troceado por seguridad)
export async function sendText(to, text) {
  const toNorm = normalizeTo(to);
  const MAX = 3500;
  for (let i = 0; i < text.length; i += MAX) {
    await callGraph({
      messaging_product: "whatsapp",
      to: toNorm,
      type: "text",
      text: { preview_url: false, body: text.slice(i, i + MAX) },
    });
  }
}

// Botones: "Ver tienda" / "Pedir por chat"
export async function sendButtons(to, message = "🎉 Registro completo. ¿Cómo quieres continuar?") {
  await callGraph({
    messaging_product: "whatsapp",
    to: normalizeTo(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: message },
      action: {
        buttons: [
          { type: "reply", reply: { id: "go_catalog",  title: "Ver tienda" } },
          { type: "reply", reply: { id: "start_order", title: "Pedir por chat" } },
        ],
      },
    },
  });
}

// (Opcional) Lista multiproducto con tus SKUs (retailer_id = SKU en tu catálogo)
export async function sendMultiProduct(to, skuList, sectionTitle = "Catálogo") {
  await callGraph({
    messaging_product: "whatsapp",
    to: normalizeTo(to),
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: "Catálogo" },
      body:   { type: "text", text: "Selecciona productos y envía el carrito." },
      action: {
        sections: [
          {
            title: sectionTitle,
            product_items: skuList.map(sku => ({ product_retailer_id: sku })),
          },
        ],
      },
    },
  });
}
