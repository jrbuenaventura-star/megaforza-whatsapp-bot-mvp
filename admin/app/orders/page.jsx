// app/orders/page.tsx
"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

const apiUrl = (p: string) =>
  `${API_BASE}${p.startsWith("/") ? p : "/" + p}`;

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(path), { cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}`);
  return r.json();
}

type OrderItem = {
  id: string;
  qty_bags: number;
  unit_price: number | string;
  line_total: number | string;
  product: { name: string; pelletized: boolean };
};

type Customer = {
  id: string;
  name: string;
  whatsapp_phone: string;
};

type Order = {
  id: string;
  status:
    | "pending_payment"
    | "processing"
    | "ready"
    | "delivered"
    | "canceled"
    | string;
  total_bags: number;
  subtotal: number | string;
  discount_total: number | string;
  total: number | string;
  created_at: string;
  customer: Customer;
  items: OrderItem[];
};

const STATUS_OPTIONS = [
  { value: "pending_payment", label: "Pendiente pago" },
  { value: "processing", label: "En producción" },
  { value: "ready", label: "Programado/Listo" },
  { value: "delivered", label: "Entregado" },
  { value: "canceled", label: "Cancelado" },
];

function fmtCOP(n: number | string) {
  const val = Number(n || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
}

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const data = await getJSON<Order[]>(`/api/orders${qs}`);
      setRows(data);
    } catch (e: any) {
      setError(e?.message || "Error cargando pedidos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await patchJSON<Order>(`/api/orders/${id}`, { status });
      setRows((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar el estado");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Filtrar estado:</label>
          <select
            className="border rounded px-2 py-1"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="border px-3 py-1 rounded"
            onClick={load}
            title="Refrescar"
          >
            Refrescar
          </button>
        </div>
      </div>

      {error && <div className="mb-3 bg-red-100 p-3 rounded text-sm">{error}</div>}

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
                <td className="p-3">{o.id.slice(0, 8)}…</td>
                <td className="p-3">
                  <div className="font-medium">{o.customer?.name}</div>
                  <div className="text-xs text-gray-500">{o.customer?.whatsapp_phone}</div>
                </td>
                <td className="p-3">{new Date(o.created_at).toLocaleString("es-CO")}</td>
                <td className="p-3 text-right">{o.total_bags}</td>
                <td className="p-3 text-right">{fmtCOP(o.subtotal)}</td>
                <td className="p-3 text-right text-amber-700">{fmtCOP(o.discount_total)}</td>
                <td className="p-3 text-right font-semibold">{fmtCOP(o.total)}</td>
                <td className="p-3">
                  <select
                    className="border rounded px-2 py-1"
                    value={STATUS_OPTIONS.find(s => s.value === o.status)?.value || o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3 text-center">
                  {savingId === o.id ? "Guardando…" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
