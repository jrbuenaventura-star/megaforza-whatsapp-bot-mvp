// admin/app/orders/page.js
async function getOrders(status) {
  const base = process.env.NEXT_PUBLIC_API_BASE; // ej: https://megaforza-whatsapp-bot-mvp.onrender.com/api
  const url = status
    ? `${base}/orders?status=${encodeURIComponent(status)}`
    : `${base}/orders`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`No se pudo cargar órdenes. ${res.status} ${txt}`);
  }
  return res.json();
}

export default async function Page({ searchParams }) {
  const status = searchParams?.status || '';
  const orders = await getOrders(status);

  return (
    <div style={{ padding: 16 }}>
      <h1>Órdenes</h1>

      {/* Filtro por estado */}
      <form style={{ margin: '12px 0' }}>
        <label>
          Estado:&nbsp;
          <select
            name="status"
            defaultValue={status}
            onChange={(e) => {
              const s = e.target.value;
              const qs = s ? `?status=${encodeURIComponent(s)}` : '';
              window.location.href = `/orders${qs}`;
            }}
          >
            <option value="">(Todos)</option>
            <option value="pending_payment">pending_payment</option>
            <option value="paid">paid</option>
            <option value="scheduled">scheduled</option>
            <option value="in_production">in_production</option>
            <option value="delivered">delivered</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
      </form>

      {/* Tabla */}
      <table
        border={1}
        cellPadding={8}
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
      >
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Orden</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Bultos</th>
            <th>Subtotal</th>
            <th>Desc.</th>
            <th>Total</th>
            <th>Ítems</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{new Date(o.created_at).toLocaleString('es-CO')}</td>
              <td>{o.id.slice(0, 8)}</td>
              <td>{o.customer?.name || ''}</td>
              <td>{o.status}</td>
              <td>{o.total_bags}</td>
              <td>${Number(o.subtotal || 0).toFixed(2)}</td>
              <td>${Number(o.discount_total || 0).toFixed(2)}</td>
              <td><b>${Number(o.total || 0).toFixed(2)}</b></td>
              <td>
                {(o.items || [])
                  .map((it) => `${it.product?.sku || ''} x ${it.qty_bags}`)
                  .join(', ')}
              </td>
            </tr>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', color: '#999' }}>
                No hay órdenes para este filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
