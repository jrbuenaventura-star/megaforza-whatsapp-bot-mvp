'use client';

import { useEffect, useState } from 'react';
// Usa tu helper que ya tienes en admin/lib/api.js
import { apiGet, apiPatch } from '../../lib/api';

const STATUS_OPTIONS = [
  { value: 'pending_payment', label: 'pending_payment' },
  { value: 'processing',      label: 'processing' },
  { value: 'ready',           label: 'ready' },
  { value: 'delivered',       label: 'delivered' },
  { value: 'canceled',        label: 'canceled' },
];

function fmtCOP(n) {
  return Number(n).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}
function fmtDT(s) {
  if (!s) return '-';
  return new Date(s).toLocaleString('es-CO');
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  async function load() {
    setLoading(true);
    const q = filterStatus ? `?status=${filterStatus}` : '';
    const data = await apiGet(`/orders${q}`);
    setOrders(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  async function onChangeStatus(id, nextStatus) {
    // Optimistic UI
    const prev = orders;
    setOrders((curr) =>
      curr.map((o) => (o.id === id ? { ...o, status: nextStatus } : o))
    );

    try {
      await apiPatch(`/orders/${id}`, { status: nextStatus });
    } catch (err) {
      console.error('PATCH /orders/:id failed', err);
      setOrders(prev); // rollback
      alert('No se pudo actualizar el estado. Intenta de nuevo.');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Pedidos</h1>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm">Filtrar por estado:</label>
        <select
          className="border rounded px-2 py-1"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Todos</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className="border rounded px-2 py-1" onClick={load}>
          Refrescar
        </button>
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">Cliente</th>
              <th className="p-2 border">Estado</th>
              <th className="p-2 border">Bultos</th>
              <th className="p-2 border">Total</th>
              <th className="p-2 border">Programado</th>
              <th className="p-2 border">Listo</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 border font-mono">{o.id.slice(0, 7)}</td>
                <td className="p-2 border">{o.customer?.name ?? '-'}</td>
                <td className="p-2 border">
                  <select
                    className="border rounded px-2 py-1"
                    value={(o.status || '').toString().toLowerCase()}
                    onChange={(e) => onChangeStatus(o.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 border">{o.total_bags}</td>
                <td className="p-2 border">{fmtCOP(o.total)}</td>
                <td className="p-2 border">{fmtDT(o.scheduled_at)}</td>
                <td className="p-2 border">{fmtDT(o.ready_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
