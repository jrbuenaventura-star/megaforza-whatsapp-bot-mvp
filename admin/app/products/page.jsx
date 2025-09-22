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

const fmtCOP = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON("/api/products?all=1");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Error cargando productos");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function savePrice(id, price) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await patchJSON(`/api/products/${id}`, { price_per_bag: Math.max(0, Math.round(Number(price))) });
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch (e) {
      setError(e?.message || "No se pudo guardar el precio");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(id, active) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await patchJSON(`/api/products/${id}`, { active: !!active });
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch (e) {
      setError(e?.message || "No se pudo actualizar el estado");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <button className="border px-3 py-1 rounded" onClick={load}>Refrescar</button>
      </div>

      {error && <div className="mb-4 rounded bg-red-100 p-3 text-sm">{error}</div>}

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <table className="w-full border rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">SKU</th>
              <th className="text-left p-3">Producto</th>
              <th className="text-right p-3">Precio (COP)</th>
              <th className="text-center p-3">Activo</th>
              <th className="text-center p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.sku}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={Math.round(Number(p.price_per_bag || 0))}
                      className="border rounded px-2 py-1 w-32 text-right"
                      onBlur={(e) => {
                        const next = Math.max(0, Math.round(Number(e.currentTarget.value)));
                        if (Number.isFinite(next) && next !== Math.round(Number(p.price_per_bag || 0))) {
                          savePrice(p.id, next);
                        } else {
                          e.currentTarget.value = String(Math.round(Number(p.price_per_bag || 0)));
                        }
                      }}
                    />
                    <span className="text-xs text-gray-500">{fmtCOP(p.price_per_bag)}</span>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    defaultChecked={!!p.active}
                    onChange={(e) => toggleActive(p.id, e.currentTarget.checked)}
                  />
                </td>
                <td className="p-3 text-center">
                  {savingId === p.id ? "Guardando…" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
