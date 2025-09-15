"use client";

import { useEffect, useState, useMemo } from "react";
import { apiGet, apiPatch } from "@/lib/api";

// Opciones de estado que verá el usuario
const STATUS_OPTIONS = [
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "processing", label: "En proceso" },
  { value: "ready", label: "Listo / Programado" },
  { value: "delivered", label: "Entregado" },
  { value: "canceled", label: "Cancelado" },
];

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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function load() {
    setLoading(true);
    try {
      // ¡Importante! usamos el helper con path SIN /api
      const data = await apiGet("/orders");
      setOrders(Array.isArray(data) ? data : []);
      setErr(null);
    } catch (e) {
      setErr(e?.message || "Error cargando pedidos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onChangeStatus(id, next) {
    // Optimistic UI
    const prev = orders;
    setOrders((curr) => curr.map((o) => (o.id === id ? { ...o, status: next } : o)));
    try {
      await apiPatch(`/orders/${id}`, { status: next });
    } catch (e) {
      alert(`Error actualizando estado: ${e?.message || e}`);
      // rollback
      setOrders(prev);
    }
  }

  const totalPedidos = useMemo(() => orders.length, [orders]);

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
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={{ fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
              <td>{o.customer?.name ?? ""}</td>
              <td>
                <select
                  value={o.status}
                  onChange={(e) => onChangeStatus(o.id, e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>{o.total_bags}</td>
              <td>{Number(o.total || 0).toLocaleString("es-CO")}</td>
              <td>{fmtBogota(o.scheduled_at)}</td>
              <td>{fmtBogota(o.ready_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
