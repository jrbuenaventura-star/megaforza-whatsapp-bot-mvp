'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';

// Estados canónicos que ve el usuario
const CANON_OPTIONS = [
  'pending_payment',
  'processing',
  'ready',
  'delivered',
  'canceled',
];

// Mapeo de estados de BD -> canónicos para mostrar en el <select>
const DB_TO_CANON = {
  in_production: 'processing',
  scheduled: 'ready',
};

const LABELS = {
  pending_payment: 'Pendiente de pago',
  processing: 'En producción',
  ready: 'Programado / Listo',
  delivered: 'Entregado',
  canceled: 'Cancelado',
};

function statusDbToCanon(db) {
  if (!db) return '';
  return DB_TO_CANON[db] || db;
}

function formatCOP(n) {
  return Number(n || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // order_id que se está guardando

  // Carga inicial
  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/orders'); // GET /api/orders
        setOrders(data);
      } catch (e) {
        console.error(e);
        alert('No pude cargar pedidos.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Cambiar estado
  async function onChangeStatus(orderId, nextCanon) {
    try {
      setSaving(orderId);
      // PATCH /api/orders/:id con un estado canónico
      const updated = await apiPatch(`/orders/${orderId}`, { status: nextCanon });

      // Actualiza en memoria con el estado real de BD que devuelve el backend
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: updated.status } : o)),
      );
    } catch (e) {
      console.error(e);
      alert('Error actualizando estado');
    } finally {
      setSaving(null);
    }
  }

  // Filas con el estado canónico derivado
  const rows = useMemo(() => {
    return (orders || []).map((o) => ({
      ...o,
      _canonStatus: statusDbToCanon(o.status),
    }));
  }, [orders]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Pedidos</h1>

      {loading ? (
        <div>Cargando…</div>
      ) : rows.length === 0 ? (
        <div>No hay pedidos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border border-gray-200">
            <thead className="bg-gray-50">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:text-sm [&>th]:font-medium">
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Bultos</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Listo/Programado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-gray-200 [&>td]:px-3 [&>td]:py-2">
                  <td className="font-mono text-xs">{o.id.slice(0, 8)}</td>
                  <td>{o.customer?.name || o.customer_id}</td>
                  <td>{o.total_bags}</td>
                  <td>{formatCOP(o.total)}</td>
                  <td>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={o._canonStatus}
                      disabled={saving === o.id}
                      onChange={(e) => onChangeStatus(o.id, e.target.value)}
                    >
                      {CANON_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {LABELS[opt] || opt}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-gray-500">
                      BD: <code>{o.status}</code>
                    </div>
                  </td>
                  <td>{new Date(o.created_at).toLocaleString('es-CO')}</td>
                  <td>
                    {o.ready_at
                      ? new Date(o.ready_at).toLocaleString('es-CO')
                      : o.scheduled_at
                      ? new Date(o.scheduled_at).toLocaleString('es-CO')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
