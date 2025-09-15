// admin/lib/api.js

// Origen del backend (sin /api al final). Ej:
// https://megaforza-whatsapp-bot-mvp.onrender.com
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const API_BASE = RAW_BASE.replace(/\/+$/, ""); // quita barras al final

if (!API_BASE) {
  // Si esto sale en build/runtime, la app intentará usar rutas relativas,
  // lo que suele fallar en Vercel. Configura la env en Vercel.
  console.warn("NEXT_PUBLIC_API_BASE no está definido");
}

/** Normaliza el path para que tenga exactamente un prefijo /api */
function normalizeApiPath(path) {
  let p = String(path || "");
  if (!p.startsWith("/")) p = "/" + p;
  // si ya viene con /api/... lo dejamos, si no, lo agregamos
  if (!p.startsWith("/api/")) p = "/api" + p;
  return p;
}

/** Construye la URL final al backend */
function buildUrl(path) {
  const apiPath = normalizeApiPath(path);
  // Si no hay base, devolvemos ruta relativa (solo útil si el mismo host sirve el /api)
  return API_BASE ? `${API_BASE}${apiPath}` : apiPath;
}

/** Llamado genérico */
export async function api(path, init) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
    // Evita que Next intente cachear respuestas del backend administrativo
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  // si la respuesta no es JSON esto lanzará; es lo deseado para detectar errores HTML/404
  return res.json();
}

/** Helpers cómodos (pásales paths SIN /api o CON /api, ambos funcionan) */
export function apiGet(path) {
  return api(path, { method: "GET" });
}

export function apiPatch(path, body) {
  return api(path, {
    method: "PATCH",
    body: JSON.stringify(body || {}),
  });
}
export function apiPost(path, body) {
  return api(`/api${path}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}
// (opcional) exportar la base para debug en /debug/env si quieres mostrarla
export const API_ORIGIN = API_BASE;
