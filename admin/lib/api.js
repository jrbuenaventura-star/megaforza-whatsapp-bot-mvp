const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

if (!API_BASE) {
  console.warn("NEXT_PUBLIC_API_BASE no está definido");
}

export async function api(path, init) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}
// Helpers cómodos usados por el Admin
export function apiGet(path) {
  return api(`/api${path}`, { method: 'GET' });
}

export function apiPatch(path, body) {
  return api(`/api${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body || {}),
  });
}
