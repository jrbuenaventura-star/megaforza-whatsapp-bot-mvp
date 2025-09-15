export const dynamic = 'force-dynamic';

import { apiGet } from '../../lib/api';
import StatusSelect from './StatusSelect';

function fmt(dt) {
  return dt
    ? new Date(dt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    : '';
}

async function getData() {
  // Trae todas las órdenes con cliente e items (tu API ya lo hace)
  return apiGet('/orders');
}

export default async function Page() {
  const orders = await getData();

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
          {Array.isArray(orders) && orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id?.slice(0, 8)}</td>
              <td>{o.customer?.name ?? ''}</td>
              <td><StatusSelect id={o.id} value={o.status} /></td>
              <td>{o.total_bags ?? 0}</td>
              <td>{o.total ?? 0}</td>
              <td>{fmt(o.scheduled_at)}</td>
              <td>{fmt(o.ready_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
