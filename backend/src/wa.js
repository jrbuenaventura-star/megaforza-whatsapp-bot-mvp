import fetch from "node-fetch";

export async function sendText(to, body){
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = { messaging_product:"whatsapp", to, type:"text", text:{ body } };
  const res = await fetch(url,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const t = await res.text();
    console.error("WA send error:", t);
  }
}
export async function sendMenu(to) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "¿Cómo te ayudo hoy?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "PEDIR",  title: "Hacer un pedido" } },
            { type: "reply", reply: { id: "AGENTE", title: "Hablar con un representante" } },
          ],
        },
      },
    }),
  });
}

// Enviar catálogo (multi-product)
export async function sendCatalog(to, sections = []) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: "Catálogo Soluagro" },
      body: { text: "Elige productos, ajusta cantidades y envía tu carrito." },
      footer: { text: "Luego puedes escribir: estado de pedidos" },
      action: {
        catalog_id: process.env.WHATSAPP_CATALOG_ID,
        sections: sections.length ? sections : [
          {
            title: "Más vendidos",
            product_items: [
              { product_retailer_id: "LEC-18" },
              { product_retailer_id: "GAN-CEB" },
              { product_retailer_id: "AVI" },
              { product_retailer_id: "EQU-10" }
            ]
          }
        ]
      }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log("WA sendCatalog:", JSON.stringify(data));
  return data;
}
// Envía el menú con 2 botones (PEDIR / AGENTE)
export async function sendChoicesMenu(to) {
  const url = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Qué te gustaría hacer?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PEDIR",  title: "Hacer un pedido" } },
          { type: "reply", reply: { id: "AGENTE", title: "Hablar con un representante" } }
        ]
      }
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[WA SEND MENU ERROR]", r.status, err);
  }
}
