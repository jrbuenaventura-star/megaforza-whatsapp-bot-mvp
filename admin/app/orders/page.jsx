"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { apiGet, apiPatch } from '@/lib/api';

// Estados que verá el usuario en el <select>
const STATUS_OPTIONS = [
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "processing",      label: "En proceso" },
  { value: "ready",           label: "Listo / Programado" },
  { value: "delivered",       label: "Entregado" },
  { value: "canceled",        label: "Cancelado" },
];
// ---- Componente cliente para editar el estado ----
function StatusSelectClient({ id, value, onSaved }) {
  'use client';
  const [v, setV] = React.useState(value);
  const [pending, startTransition] = React.useTransition();

// Mapa DB -> UI (la DB usa 'scheduled' y 'in_production')
const DB_TO_UI = {
  scheduled: "ready",
  in_production: "processing",
  // por si quedara algo viejo en DB:
  paid: "processing",
};
  const OPTIONS = [
    'pending_payment',
    'processing',
    'ready',
    'delivered',
    'canceled',
  ];

// Mapa UI -> etiqueta (para mostrar bonito si lo necesitas)
const LABELS = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));

// Normaliza un estado cualquiera al canónico de UI
function toUiStatus(s) {
  if (!s) return "";
  const k = String(s).toLowerCase();
  return DB_TO_UI[k] || k;
}

function fmtBogota(dt) {
  if (!dt) return "";
  try {
    const d = typeof dt === "string" ? new Date(dt) : dt;
    return d.toLocaleString("es-CO", { timeZone: "America/Bogota" });
  } catch {
    return "";
  }
}

export default function Page() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [savingId, setSaving] = useState(null); // para deshabilitar el select mientras guarda

  async function load() {
    setLoading(true);
  async function save(next) {
    setV(next); // optimista
try {
      // Importante: el helper ya antepone /api y usa NEXT_PUBLIC_API_BASE
      const data = await apiGet("/orders");
      setOrders(Array.isArray(data) ? data : []);
      setErr(null);
      const updated = await apiPatch(`/orders/${id}`, { status: next });
      onSaved?.(updated);
} catch (e) {
      setErr(e?.message || "Error cargando pedidos");
    } finally {
      setLoading(false);
      console.error('PATCH /orders/:id failed', e);
      alert('No se pudo actualizar el estado');
      setV(value); // rollback
}
}

  useEffect(() => {
    load();
  }, []);

  async function onChangeStatus(id, nextUiStatus) {
    // Optimistic UI
    const prev = orders;
    setSaving(id);
    setOrders(curr =>
      curr.map(o => (o.id === id ? { ...o, status: nextUiStatus } : o))
    );
    try {
      // Enviamos el valor canónico de UI; el backend lo mapea a la enum real
      await apiPatch(`/orders/${id}`, { status: nextUiStatus });
    } catch (e) {
      alert(`Error actualizando estado: ${e?.message || e}`);
      setOrders(prev); // rollback
    } finally {
      setSaving(null);
    }
  }
  return (
    <select
      value={v}
      onChange={(e) => startTransition(() => save(e.target.value))}
      disabled={pending}
      style={{ padding: 4 }}
    >
      {OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

  const totalPedidos = useMemo(() => orders.length, [orders]);
// ---- Página (server component) ----
export default async function Page() {
  const orders = await apiGet('/orders'); // trae todo

return (
<div>
<h1>Pedidos</h1>

      {loading && <p>Cargando…</p>}
      {err && (
        <p style={{ color: "crimson" }}>
          {String(err)}{" "}
          <button onClick={load} style={{ marginLeft: 8 }}>
            Reintentar
          </button>
        </p>
      )}

      <p style={{ opacity: 0.8 }}>Total: {totalPedidos}</p>

<table
        cellPadding={8}
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
border="1"
        cellPadding="8"
        style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}
>
<thead>
<tr>
<th>ID</th>
<th>Cliente</th>
<th>Estado</th>
<th>Bultos</th>
<th>Total</th>
<th>Programado</th>
<th>Listo</th>
</tr>
</thead>
<tbody>
          {orders.map(o => {
            const uiStatus = toUiStatus(o.status);
          {orders.map((o) => {
            const shortId = o.id?.slice(0, 8) ?? '';
            const eta = o.scheduled_at
              ? new Date(o.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
              : '';
            const ready = o.ready_at
              ? new Date(o.ready_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
              : '';
            const total = Number(o.total || 0).toLocaleString('es-CO', {
              style: 'currency',
              currency: 'COP',
              maximumFractionDigits: 0
            });

return (
<tr key={o.id}>
                <td style={{ fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                <td>{o.customer?.name ?? ""}</td>
                <td>{shortId}</td>
                <td>{o.customer?.name ?? ''}</td>
<td>
                  <select
                    value={uiStatus}
                    disabled={savingId === o.id}
                    onChange={e => onChangeStatus(o.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <StatusSelectClient
                    id={o.id}
                    value={o.status}
                    onSaved={() => {/* opcional: revalidar o nada */}}
                  />
</td>
<td>{o.total_bags}</td>
                <td>{Number(o.total || 0).toLocaleString("es-CO")}</td>
                <td>{fmtBogota(o.scheduled_at)}</td>
                <td>{fmtBogota(o.ready_at)}</td>
                <td>{total}</td>
                <td>{eta}</td>
                <td>{ready}</td>
</tr>
);
})}
</tbody>
</table>
</div>
);
}
