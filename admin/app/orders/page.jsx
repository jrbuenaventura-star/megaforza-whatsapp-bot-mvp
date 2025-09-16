export const dynamic = 'force-dynamic';

import { apiGet, apiPatch } from '@/lib/api';

// ---- Componente cliente para editar el estado ----
function StatusSelectClient({ id, value, onSaved }) {
  'use client';
  const [v, setV] = React.useState(value);
  const [pending, startTransition] = React.useTransition();

  const OPTIONS = [
    'pending_payment',
    'processing',
    'ready',
    'delivered',
    'canceled',
  ];

  async function save(next) {
    setV(next); // optimista
    try {
      const updated = await apiPatch(`/orders/${id}`, { status: next });
      onSaved?.(updated);
    } catch (e) {
      console.error('PATCH /orders/:id failed', e);
      alert('No se pudo actualizar el estado');
      setV(value); // rollback
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

// ---- Página (server component) ----
export default async function Page() {
  const orders = await apiGet('/orders'); // trae todo

  return (
    <div>
      <h1>Pedidos</h1>
      <table
        cellPadding={8}
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
        border="1"
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
                <td>{shortId}</td>
                <td>{o.customer?.name ?? ''}</td>
                <td>
                  <StatusSelectClient
                    id={o.id}
                    value={o.status}
                    onSaved={() => {/* opcional: revalidar o nada */}}
                  />
                </td>
                <td>{o.total_bags}</td>
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
