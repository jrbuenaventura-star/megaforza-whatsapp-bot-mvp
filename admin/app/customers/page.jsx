"use client";

import { useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
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
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, p] = await Promise.all([getJSON("/api/customers"), getJSON("/api/products?all=1")]);
      setCustomers(c || []);
      setProducts(p || []);
    } catch (e) {
      setError(e?.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function saveCustomerDiscount(id, discount) {
    setSaving(id);
    setError(null);
    try {
      const updated = await patchJSON(`/api/customers/${id}`, { discount_pct: Number(discount) });
      setCustomers((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e?.message || "No se pudo guardar el descuento");
    } finally {
      setSaving(null);
    }
  }

  async function saveProductPrice(id, price) {
    setSaving(`p:${id}`);
    setError(null);
    try {
      const updated = await patchJSON(`/api/products/${id}`, { price_per_bag: Math.max(0, Math.round(Number(price))) });
      setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e?.message || "No se pudo guardar el precio");
    } finally {
      setSaving(null);
    }
  }

  async function toggleProductActive(id, active) {
    setSaving(`p:${id}`);
    setError(null);
    try {
      const updated = await patchJSON(`/api/products/${id}`, { active: !!active });
      setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e?.message || "No se pudo actualizar el estado");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Clientes</h1>

      {error && <div className="rounded bg-red-100 p-3 text-sm">{error}</div>}

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <>
          {/* Clientes */}
          <div>
            <h2 className="text-xl font-semibold mb-3">Descuentos por cliente</h2>
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
                              saveCustomerDiscount(c.id, Number(next.toFixed(2)));
                            } else {
                              e.currentTarget.value = String(val);
                            }
                          }}
                        />
                      </td>
                      <td className="p-3 text-center">{saving === c.id ? "Guardando…" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Catálogo rápido (precio y activo) */}
          <div>
            <h2 className="text-xl font-semibold mb-3">Catálogo rápido (precio y activo)</h2>
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
                {products.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">{p.sku}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={Math.round(Number(p.price_per_bag || 0))}
                        className="border rounded px-2 py-1 w-32 text-right"
                        onBlur={(e) => {
                          const next = Math.max(0, Math.round(Number(e.currentTarget.value)));
                          if (Number.isFinite(next) && next !== Math.round(Number(p.price_per_bag || 0))) {
                            saveProductPrice(p.id, next);
                          } else {
                            e.currentTarget.value = String(Math.round(Number(p.price_per_bag || 0)));
                          }
                        }}
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={!!p.active}
                        onChange={(e) => toggleProductActive(p.id, e.currentTarget.checked)}
                      />
                    </td>
                    <td className="p-3 text-center">{saving === `p:${p.id}` ? "Guardando…" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
