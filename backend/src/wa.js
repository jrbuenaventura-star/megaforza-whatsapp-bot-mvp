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
