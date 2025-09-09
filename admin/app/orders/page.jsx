async function getData(){
  const res = await fetch(process.env.NEXT_PUBLIC_API_BASE + '/orders', { cache: 'no-store' });
  return res.json();
}
export default async function Page(){
  const orders = await getData();
  return (
    <div>
      <h1>Pedidos</h1>
      <table border="1" cellPadding="8" style={{ borderCollapse:'collapse', width:'100%', background:'#fff' }}>
        <thead><tr><th>ID</th><th>Cliente</th><th>Estado</th><th>Bultos</th><th>Total</th><th>Programado</th><th>Listo</th></tr></thead>
        <tbody>
          {orders.map(o=> (
            <tr key={o.id}>
              <td>{o.id.slice(0,8)}</td>
              <td>{o.customer?.name}</td>
              <td>{o.status}</td>
              <td>{o.total_bags}</td>
              <td>{o.total}</td>
              <td>{o.scheduled_at ? new Date(o.scheduled_at).toLocaleString('es-CO') : ''}</td>
              <td>{o.ready_at ? new Date(o.ready_at).toLocaleString('es-CO') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
