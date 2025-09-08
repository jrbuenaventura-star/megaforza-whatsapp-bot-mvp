// admin/app/reports/pending/page.js
export const dynamic = 'force-dynamic'; // evita caché en Vercel ISR

async function fetchJSON(path) {
  const base = (process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, '')) || 'http://localhost:3000/api';
  const res = await fetch(`${base}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Fetch ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export default async function Page() {
  let byProd = [];
  let byCust = [];
  let err = null;

  try {
    [byProd, byCust] = await Promise.all([
      fetchJSON('/reports/pendingByProduct'),   // [{ product, qty_bags }]
      fetchJSON('/reports/pendingByCustomer'),  // [{ customer, product, qty_bags }]
    ]);
  } catch (e) {
    err = e.message || String(e);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Pendientes</h1>

      {err ? (
        <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{err}</pre>
      ) : (
        <>
          <section style={{ marginTop: 16 }}>
            <h2>Por producto</h2>
            <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Bultos pendientes</th>
                </tr>
              </thead>
              <tbody>
                {byProd.length === 0 ? (
                  <tr><td colSpan={2} style={{ textAlign: 'center' }}>Sin pendientes</td></tr>
                ) : (
                  byProd.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row?.product ?? '—'}</td>
                      <td>{Number(row?.qty_bags ?? 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>Por cliente y producto</h2>
            <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Bultos pendientes</th>
                </tr>
              </thead>
              <tbody>
                {byCust.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center' }}>Sin pendientes</td></tr>
                ) : (
                  byCust.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row?.customer ?? '—'}</td>
                      <td>{row?.product ?? '—'}</td>
                      <td>{Number(row?.qty_bags ?? 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
