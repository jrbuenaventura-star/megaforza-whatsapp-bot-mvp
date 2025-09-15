// admin/app/orders/page.jsx
export const dynamic = 'force-dynamic'; // que no se prerenderice en build

import { apiGet, apiPatch } from '@/lib/api';

// --- Componente CLIENTE solo para el <select> ---
function StatusSelect({ id, value }) {
  'use client';
  import { useRouter } from 'next/navigation';
  import { useTransition } from 'react';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const options = [
    'pending_payment',
    'processing',
    'ready',
    'delivered',
    'canceled',
  ];

  async function onChange(e) {
    const status = e.target.value;
    try {
      await apiPatch(`/orders/${id}`, { status });
      // refresca los datos del server component
      startTransition(() => router.refresh());
    } catch (err) {
      alert(`Error actualizando: ${err.message}`);
    }
  }

  return (
    <select disabled={isPending} defaultValue={value} onChange={onChange}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// --- Página SERVER que trae la lista desde el backend ---
async function getOrders() {
  // apiGet agrega /api al path y usa NEXT_PUBLIC_API_BASE
  return apiGet('/orders');
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
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id.slice(0, 8)}</td>
              <td>{o.customer?.name ?? ''}</td>
              <td><StatusSelect id={o.id} value={o.status} /></td>
              <td>{o.total_bags}</td>
              <td>{Number(o.total).toLocaleString('es-CO')}</td>
              <td>
                {o.scheduled_at
                  ? new Date(o.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                  : ''}
              </td>
              <td>
                {o.ready_at
                  ? new Date(o.ready_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
