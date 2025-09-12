import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic'; // evita cacheo en build

async function getData() {
  // NO pongas /api aquí; el helper ya lo antepone
  return apiGet('/reports/pendingByCustomer');
}

export default async function Page() {
  let data = {};
  try {
    data = await getData();
  } catch (err) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Pendientes por cliente</h1>
        <p style={{ color: '#b91c1c', marginTop: 12 }}>
          No se pudo cargar el reporte.
        </p>
        <pre style={{ marginTop: 8, background: '#f3f4f6', padding: 12, fontSize: 12, borderRadius: 6 }}>
{String(err.message)}
        </pre>
      </div>
    );
  }

  const customers = Object.keys(data || {}).sort();

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Pendientes por cliente
      </h1>

      <table
        style={{
          width: '100%',
          background: '#fff',
          borderCollapse: 'collapse',
          border: '1px solid #e5e7eb'
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Cliente</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Producto</th>
            <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Bultos</th>
          </tr>
        </thead>
        <tbody>
          {customers.flatMap((cust) => {
            const rows = Object.entries(data[cust] || {});
            if (rows.length === 0) return [];
            return rows.map(([prod, qty], idx) => (
              <tr key={`${cust}-${prod}`}>
                {idx === 0 ? (
                  <td style={{ padding: 8, verticalAlign: 'top', borderBottom: '1px solid #e5e7eb' }} rowSpan={rows.length}>
                    {cust}
                  </td>
                ) : null}
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>{prod}</td>
                <td style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>{qty}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
