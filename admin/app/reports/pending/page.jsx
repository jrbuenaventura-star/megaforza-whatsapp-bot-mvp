// admin/app/reports/pending/page.jsx
export const dynamic = 'force-dynamic';
import { apiGet } from '@/lib/api';

export default async function Page() {
  const data = await apiGet('/reports/pendingByCustomer'); // { cliente: { producto: qty } }
  const customers = Object.keys(data || {});

  return (
    <div>
      <h1>Pendientes por cliente</h1>
      {customers.length === 0 ? (
        <p>No hay pendientes.</p>
      ) : (
        customers.map((c) => {
          const items = data[c] || {};
          const prods = Object.keys(items);
          return (
            <div key={c} style={{ marginBottom: 24 }}>
              <h3>{c}</h3>
              <table
                border="1"
                cellPadding="8"
                style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
              >
                <thead>
                  <tr><th>Producto</th><th>Bultos</th></tr>
                </thead>
                <tbody>
                  {prods.map((p) => (
                    <tr key={p}>
                      <td>{p}</td>
                      <td>{items[p]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
