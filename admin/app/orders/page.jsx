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

const canon = (s) => (s === "in_production" ? "processing" : s === "scheduled" ? "ready" : s);
const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pending_payment", label: "Pendiente pago" },
  { value: "processing", label: "En producción" },
  { value: "ready", label: "Programado/Listo" },
  { value: "delivered", label: "Entregado" },
  { value: "canceled", label: "Cancelado" },
];
const DATE_OPTIONS = [
  { value: "", label: "Todas las fechas" },
  { value: "week", label: "Última semana" },
  { value: "month", label: "Último mes" },
  { value: "thismonth", label: "Mes actual" },
];

const fmtCOP = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function OrdersPage() {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (customerQ) qs.set("customer", customerQ);
      if (dateFilter) qs.set("date", dateFilter);
      const data = await getJSON(`/api/orders${qs.toString() ? `?${qs.toString()}` : ""}`);
      setRows(Array.isArray(data.orders) ? data.orders : []);
      setTotals(data.totals_by_status || {});
    } catch (e) {
      setError(e?.message || "Error cargando pedidos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, dateFilter]);

  async function updateStatus(id, status) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await patchJSON(`/api/orders/${id}`, { status });
      setRows((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch (e) {
      setError(e?.message || "No se pudo actualizar el estado");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="border rounded px-2 py-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            className="border rounded px-2 py-1"
            placeholder="Cliente (nombre o id)"
            value={customerQ}
            onChange={(e) => setCustomerQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          />
          <select className="border rounded px-2 py-1" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            {DATE_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <button className="border px-3 py-1 rounded" onClick={load}>Aplicar</button>
        </div>
      </div>

      {/* Totales por estado */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {STATUS_OPTIONS.filter(s => s.value).map((s) => (
          <div key={s.value} className="rounded bg-gray-100 px-3 py-1">
            <span className="text-gray-600">{s.label}:</span>{" "}
            <span className="font-semibold">{totals[s.value] || 0} bultos</span>
          </div>
        ))}
      </div>

      {error && <div className="bg-red-100 p-3 rounded text-sm">{error}</div>}

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <table className="w-full border rounded overflow-hidden text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Pedido</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Creado</th>
              <th className="p-3 text-right">Bultos</th>
              <th className="p-3 text-right">Subtotal</th>
              <th className="p-3 text-right">Desc</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-3">{o.id?.slice(0, 8)}…</td>
                <td className="p-3">
                  <div className="font-medium">{o.customer?.name}</div>
                  <div className="text-xs text-gray-500">{o.customer?.whatsapp_phone}</div>
                </td>
                <td className="p-3">{o.created_at ? new Date(o.created_at).toLocaleString("es-CO") : "—"}</td>
                <td className="p-3 text-right">{o.total_bags}</td>
                <td className="p-3 text-right">{fmtCOP(o.subtotal)}</td>
                <td className="p-3 text-right text-amber-700">{fmtCOP(o.discount_total)}</td>
                <td className="p-3 text-right font-semibold">{fmtCOP(o.total)}</td>
                <td className="p-3">
                  <select className="border rounded px-2 py-1" value={canon(o.status)} onChange={(e) => updateStatus(o.id, e.target.value)}>
                    {STATUS_OPTIONS.filter(s => s.value).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3 text-center">{savingId === o.id ? "Guardando…" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
