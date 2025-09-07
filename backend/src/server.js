// backend/src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sendText, sendButtons, sendMultiProduct } from './wa.js';
import { prisma } from './db.js';                // ✅ una sola instancia centralizada
import { router as api } from './routes.js';
import { scheduleOrderForItems } from './scheduler.js';

const app = express();
app.use(cors());
app.use(express.json());

// --------- Health check ---------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// --------- Verificación de webhook (GET) ---------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --------- Utilidades de validación ---------
function stripAccents(str='') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function isEmail(s) {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(s.trim());
}
function normalizeDocType(txt = '') {
  const t = stripAccents(String(txt).trim()).toLowerCase();
  if (t === '1' || t === 'cedula') return 'CEDULA';
  if (t === '2' || t === 'nit')     return 'NIT';
  return null;
}
function docTypeLabel(code) {
  return code === 'CEDULA' ? 'Cédula' : 'NIT';
}
case 'ASK_DOC_TYPE': {
  const code = normalizeDocType(body);
  if (!code) {
    await sendText(
      from,
      'No te entendí. Responde con:\n' +
      '1) Cédula\n' +
      '2) NIT'
    );
    return;
  }
  s = await prisma.onboarding.update({
    where: { whatsapp_phone: from },
    data: { draft_doc_type: code, state: 'ASK_DOC_NUMBER' }
  });
  await sendText(from, `Perfecto. Escribe tu número de *${docTypeLabel(code)}* (solo números).`);
  return;
}
  s = await prisma.onboarding.update({
    where: { whatsapp_phone: from },
    data: { draft_doc_type: code, state: 'ASK_DOC_NUMBER' }
  });
  await sendText(from, `Perfecto. Escribe tu número de *${docTypeLabel(code)}* (solo números).`);
  return;
}
  s = await prisma.onboarding.update({
    where: { whatsapp_phone: from },
    data: { draft_doc_type: code, state: 'ASK_DOC_NUMBER' }
  });
  await sendText(from, `Perfecto. Escribe tu número de *${docTypeLabel(code)}* (solo números).`);
  return;
}
// --------- Onboarding paso-a-paso ---------
async function handleOnboarding(from, body) {
  const lower = (body || '').trim().toLowerCase();

  // Comandos globales
  if (['cancelar', 'salir'].includes(lower)) {
    await prisma.onboarding.delete({ where: { whatsapp_phone: from } }).catch(() => {});
    await sendText(from, '🚪 Registro cancelado. Escribe *REGISTRAR* cuando quieras retomarlo.');
    return;
  }
  if (['reiniciar', 'reset', 'empezar'].includes(lower)) {
    await prisma.onboarding.upsert({
      where: { whatsapp_phone: from },
      update: { state: 'ASK_NAME', draft_name: null, draft_doc_type: null, draft_doc_number: null, draft_email: null },
      create: { whatsapp_phone: from, state: 'ASK_NAME' }
    });
    await sendText(from, '🔄 Empecemos de nuevo. ¿Cuál es tu *Nombre* (persona o empresa)?');
    return;
  }

  // Crea/obtiene sesión
  let s = await prisma.onboarding.upsert({
    where: { whatsapp_phone: from },
    update: {},
    create: { whatsapp_phone: from, state: 'ASK_NAME' }
  });

  switch (s.state) {
    case 'ASK_NAME': {
      if (!body.trim()) {
        await sendText(from, '¿Cuál es tu *Nombre* (persona o empresa)?');
        return;
      }
      s = await prisma.onboarding.update({
        where: { whatsapp_phone: from },
        data: { draft_name: body.trim(), state: 'ASK_DOC_TYPE' }
      });
      await sendText(
    from,
    'Elige el tipo de documento:\n' +
    '1) Cédula\n' +
    '2) NIT\n\n' +
    'Responde *1* o *2*.'
  );
      return;
    }

    case 'ASK_DOC_NUMBER': {
      const digits = body.replace(/\D/g, '');
      if (!digits) {
        await sendText(from, 'El número debe contener solo dígitos. Inténtalo de nuevo.');
        return;
      }
      s = await prisma.onboarding.update({
        where: { whatsapp_phone: from },
        data: { draft_doc_number: digits, state: 'ASK_EMAIL' }
      });
      await sendText(
    from,
    'Elige el tipo de documento:\n' +
    '1) Cédula\n' +
    '2) NIT\n\n' +
    'Responde *1* o *2*.'
  );
  return;
}

    case 'ASK_EMAIL': {
      if (!isEmail(body)) {
        await sendText(from, 'El correo no es válido. Prueba con otro (ej: nombre@empresa.com).');
        return;
      }
      s = await prisma.onboarding.update({
        where: { whatsapp_phone: from },
        data: { draft_email: body.trim(), state: 'CONFIRM' }
      });
      await sendText(
        from,
        `Por favor confirma:\n• Nombre: ${s.draft_name}\n`• Documento: ${docTypeLabel(s.draft_doc_type)} ${s.draft_doc_number}\n` Correo: ${s.draft_email}\n\nResponde *SI* para guardar o *EDITAR* para cambiar (ej: "editar nombre").`
      );
      return;
    }

   case 'CONFIRM': {
  if (lower === 'si' || lower === 'sí') {
    const exists = await prisma.customer.findUnique({ where: { whatsapp_phone: from } });
    const docTypeCode = normalizeDocType(s.draft_doc_type) || s.draft_doc_type; // 'CEDULA'|'NIT'
    if (!exists) {
      await prisma.customer.create({
        data: {
          name: s.draft_name,
          doc_type: docTypeCode,     // ENUM correcto
          doc_number: s.draft_doc_number,
          billing_email: s.draft_email,
          whatsapp_phone: from,
          discount_pct: 0
        }
      });
    }
    await prisma.onboarding.delete({ where: { whatsapp_phone: from } }).catch(() => {});
    await sendButtons(from, "🎉 Registro completo. ¿Cómo quieres continuar?");
    // (opcional) muestra 6–10 SKUs rápidos
    const top = await prisma.product.findMany({ where:{ active:true }, orderBy:{ name:'asc' }, take:8 });
    if (top.length) await sendMultiProduct(from, top.map(p => p.sku));
    return;
  }
  ...
}
    await prisma.onboarding.delete({ where: { whatsapp_phone: from } }).catch(() => {});
    await sendButtons(from);
    return;
  }
async function sendButtons(to) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "🎉 Registro completo. ¿Cómo quieres continuar?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "go_catalog",   title: "Ver tienda" } },
          { type: "reply", reply: { id: "start_order",  title: "Pedir por chat" } }
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
    body: JSON.stringify(payload)
  });
  if (!r.ok) console.error("sendButtons error:", r.status, await r.text());
}
        return;
      }

      if (lower.startsWith('editar')) {
        if (lower.includes('nombre')) {
          await prisma.onboarding.update({ where: { whatsapp_phone: from }, data: { state: 'ASK_NAME' } });
          await sendText(from, 'Escribe el *Nombre* correcto:');
          return;
        }
        if (lower.includes('documento')) {
          await prisma.onboarding.update({ where: { whatsapp_phone: from }, data: { state: 'ASK_DOC_TYPE' } });
          await sendText(from, '¿Tu documento es *Cédula* o *NIT*?');
          return;
        }
        if (lower.includes('correo') || lower.includes('email')) {
          await prisma.onboarding.update({ where: { whatsapp_phone: from }, data: { state: 'ASK_EMAIL' } });
          await sendText(from, 'Escribe el *correo de facturación* correcto:');
          return;
        }
        await sendText(from, 'Indica qué quieres editar: *editar nombre*, *editar documento* o *editar correo*.');
        return;
      }

      await sendText(from, 'Responde *SI* para guardar, o escribe *EDITAR* para cambiar algún dato.');
      return;
    }
  }
}

// --------- Webhook de WhatsApp (POST) ---------
app.post('/webhook', async (req, res) => {
  console.log('INBOUND WEBHOOK:', JSON.stringify(req.body));
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;

    // 0) WhatsApp manda "statuses" (entregado/leído) SIN mensajes: ignóralos.
    if (change?.statuses?.length) return res.sendStatus(200);

    // 1) Primer mensaje real
    const msg = change?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;                         // 5731...
    const body = (msg.text?.body || '').trim();    // texto del cliente
    const lower = body.toLowerCase();

    // 2) ¿Es cliente?
    const customer = await prisma.customer.findUnique({
      where: { whatsapp_phone: from }
    });

    // 3) ¿Hay sesión de onboarding?
    let session = await prisma.onboarding.findUnique({
      where: { whatsapp_phone: from }
    });

    // 4) Si NO es cliente y NO hay sesión: crea sesión y saluda (intro garantizado)
    if (!customer && !session) {
      await prisma.onboarding.create({
        data: { whatsapp_phone: from, state: 'ASK_NAME' }
      });
      await sendText(
        from,
        '👋 ¡Hola! Soy el asistente de *Megaforza*.\n' +
        'Te ayudo a crear tu cuenta en 4 pasos. ¿Cuál es tu *Nombre* (persona o empresa)?'
      );
      return res.sendStatus(200);
    }

    // 5) Si NO es cliente pero SÍ hay sesión → continuar onboarding paso a paso
    if (!customer) {
      await handleOnboarding(from, body);
      return res.sendStatus(200);
    }
if (msg.type === 'interactive') {
  const btnId =
    msg.interactive?.button_reply?.id   // botones "reply"
    || msg.interactive?.list_reply?.id   // (por si usas listas)
    || msg.button?.payload;              // fallback

  if (btnId === 'go_catalog') {
    await sendText(
      from,
      '🛍️ Abre nuestro *perfil de WhatsApp* y toca **Ver tienda**. ' +
      'También puedes enviarme el carrito o escribir el pedido por chat.'
    );
    // (opcional) enviar una lista corta de productos
    // const top = await prisma.product.findMany({ where:{active:true}, orderBy:{name:'asc'}, take:8 });
    // if (top.length) await sendMultiProduct(from, top.map(p => p.sku));
    return res.sendStatus(200);
  }

  if (btnId === 'start_order') {
    await sendText(
      from,
      '🧾 Escribe tu pedido así:\n`SKU x cantidad; SKU x cantidad`\n' +
      'Ej.: `LEC-18P x 1200; SUP-GAN x 300`'
    );
    // (opcional) sugerir 6–8 SKUs
    // const top = await prisma.product.findMany({ where:{active:true}, orderBy:{name:'asc'}, take:8 });
    // if (top.length) await sendMultiProduct(from, top.map(p => p.sku));
    return res.sendStatus(200);
  }
}
/* ──────────────────────────────────────────────────────────────── */

    // 8) Respuesta por defecto
    const shortName = customer.name?.split(' ')[0] || 'cliente';
    await sendText(
      from,
      `👋 Hola, *${shortName}*.\n` +
      `Escribe *CATALOGO* para ver productos o *PEDIR* para hacer un pedido.\n` +
      `Ej.: \`LEC-18P x 1200; SUP-GAN x 300\``
    );
    return res.sendStatus(200);

  } catch (e) {
    console.error('WEBHOOK ERROR:', e, JSON.stringify(req.body));
    return res.sendStatus(200);
  }
});
// --------- API REST del panel ---------
app.use('/api', api);

// --------- Arrancar servidor ---------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});   
