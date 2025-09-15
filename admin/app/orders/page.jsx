'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '../../lib/api';

// Estados que usará la UI (canónicos)
const CANON_OPTIONS = [
  'pending_payment',
  'processing',
  'ready',
  'delivered',
  'canceled',
];

// Mapeo DB -> canónico (lo que viene del backend)
const DB_TO_CANON = {
  in_production: 'processing',
  scheduled: 'ready',
};

// (opcional) etiquetas bonitas
const LABELS = {
  pending_payment: 'Pendiente de pago',
  processing: 'En producción',
  ready: 'Programado/ Listo',
  delivered: 'Entregado',
  canceled: 'Cancelado',
};

function statusDbToCanon(db) {
  if (!db) return '';
  return DB_TO_CANON[db] || db; // si no está en el mapa, ya es canónico
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
  const [saving, setSaving] = useState(null); // order_id que se está guardando (para deshabilitar el select)

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

  // Maneja cambio de estado
  async function onChangeStatus(orderId, nextCanon) {
    try {
      setSaving(orderId);
      // PATCH /api/orders/:id con un estado canónico (paid/ready/etc)
      const updated = await apiPatch(`/orders/${orderId}`, { status: nextCanon });
      // El backend responde con el estado "real" de BD (p.ej. in_production, scheduled)
      const canon = statusDbToCanon(updated.status);

      // Actualiza en memoria
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: updated.status } : o))
      );
    } catch (e) {
      console.error(e);
      alert('Error actualizando estado');
    } finally {
      setSaving(null);
    }
  }

  const rows = useMemo(() => {
    return orders.map((o) => {
      const canon = statusDbToCanon(o.status);
      return { ...o, _canonStatus: canon };
    });
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
                    {/* Muestra el valor real de BD en pequeñito por transparencia */}
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
export const dynamic = 'force-dynamic';

import { apiGet } from '@/lib/api';
import StatusSelect from './StatusSelect';

async function getOrders() {
  return apiGet('/orders');
}

function fmt(dt) {
  if (!dt) return '';
  try {
    return new Date(dt).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  } catch {
    return String(dt);
  }
}

export default async function Page() {
  const orders = await getOrders();

  return (
    <div>
      <h1>Pedidos</h1>
      <table
        border="1"
        cellPadding="8"
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
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
          {Array.isArray(orders) &&
            orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id?.slice(0, 8)}</td>
                <td>{o.customer?.name ?? ''}</td>
                <td>
                  {/* componente cliente para editar estado */}
                  <StatusSelect orderId={o.id} value={o.status} />
                </td>
                <td>{o.total_bags ?? 0}</td>
                <td>{o.total ?? ''}</td>
                <td>{fmt(o.scheduled_at)}</td>
                <td>{fmt(o.ready_at)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
