"use client";

import { useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const apiUrl = (p) => `${API_BASE}${p.startsWith("/") ? p : "/" + p}`;

async function getJSON(path) {
  const r = await fetch(apiUrl(path), { cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
async function patchJSON(path, body) {
  const r = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}`);
  return r.json();
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON("/api/customers");
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Error cargando clientes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function saveDiscount(id, discount) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await patchJSON(`/api/customers/${id}`, { discount_pct: Number(discount) });
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch (e) {
      setError(e?.message || "No se pudo guardar el descuento");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Clientes</h1>
      {error && <div className="mb-4 rounded bg-red-100 p-3 text-sm">{error}</div>}
      {loading ? (
        <div>Cargando…</div>
      ) : (
        <table className="w-full border rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">WhatsApp</th>
              <th className="text-left p-3">Descuento (%)</th>
              <th className="text-center p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const val = Number(c.discount_pct || 0);
              return (
                <tr key={c.id} className="border-t">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c.whatsapp_phone}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      defaultValue={val}
                      className="border rounded px-2 py-1 w-28"
                      onBlur={(e) => {
                        let next = Number(e.currentTarget.value);
                        if (!Number.isFinite(next)) next = val;
                        next = Math.min(100, Math.max(0, next));
                        if (next !== val) {
                          saveDiscount(c.id, Number(next.toFixed(2)));
                        } else {
                          e.currentTarget.value = String(val);
                        }
                      }}
                    />
                  </td>
                  <td className="p-3 text-center">{savingId === c.id ? "Guardando…" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
