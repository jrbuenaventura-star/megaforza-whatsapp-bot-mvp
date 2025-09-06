// src/wa.js

// Node 18+ ya trae fetch global. Si tienes "import fetch from 'node-fetch'"
// puedes quitarlo para simplificar.

const GRAPH_URL = "https://graph.facebook.com/v20.0";

// WhatsApp suele aceptar números con indicativo SIN "+", ej: 573001234567
function normalizeTo(number) {
  return (number || "").replace(/[^\d]/g, ""); // quita espacios, +, etc.
}

// Envía texto troceado (por si excedes límites)
export async function sendText(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    console.error("Faltan WHATSAPP_PHONE_ID o WHATSAPP_ACCESS_TOKEN");
    return;
  }

  const toNorm = normalizeTo(to);

  // WhatsApp acepta hasta ~4096 chars; uso margen seguro
  const MAX = 3500;
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + MAX));
    i += MAX;
  }

  for (const chunk of chunks) {
    const payload = {
      messaging_product: "whatsapp",
      to: toNorm,
      type: "text",
      text: { preview_url: false, body: chunk }
    };

    const res = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("sendText error:", res.status, body);
    }
  }
}
