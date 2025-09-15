"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "pending_payment", label: "Pendiente pago" },
  { value: "processing",      label: "En producción" },
  { value: "ready",           label: "Listo/Programado" },
  { value: "delivered",       label: "Entregado" },
  { value: "canceled",        label: "Cancelado" },
];

function fmtCOP(n) {
  try {
    return Number(n).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  } catch {
    return n;
  }
}

export default function OrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/orders"); // GET /api/orders en tu backend
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "No se pudo cargar órdenes");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id, newStatus) {
    setError("");
    setSavingId(id);

    // Optimistic UI
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));

    try {
      const updated = await apiPatch(`/orders/${id}`, { status: newStatus }); // PATCH /api/orders/:id
      // Ajusta a lo que devuelva el backend (canónico/sinónimos)
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: updated.status } : r)));
    } catch (e) {
      setError(`No se pudo actualizar: ${e?.message || "Error"}`);
      setRows(prev); // revertir
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Órdenes</h1>

      {error ? (
        <div style={{ marginBottom: 12, color: "#b91c1c" }}>{error}</div>
      ) : null}

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <table
          border={1}
          cellPadding={8}
          style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}
        >
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th>ID</th>
              <th>Cliente</th>
              <th>Total (COP)</th>
              <th>Estado</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td style={{ fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                <td>{o.customer?.name || "—"}</td>
                <td>{fmtCOP(o.total)}</td>
                <td>
                  <select
                    value={o.status}
                    onChange={(e) => changeStatus(o.id, e.target.value)}
                    disabled={savingId === o.id}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {o.created_at
                    ? new Date(o.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 12 }}>
        <button onClick={load} disabled={loading || savingId}>
          Recargar
        </button>
      </div>
    </div>
  );
}
