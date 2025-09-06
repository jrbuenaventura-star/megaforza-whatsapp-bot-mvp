// app/customers/page.jsx
async function getData() {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000/api';
  const url = `${base.replace(/\/+$/, '')}/customers`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Error ${res.status}: ${text}`);
  }
  return res.json();
}

export default async function Page() {
  let data;
  try {
    data = await getData();
  } catch (e) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Clientes</h1>
        <p style={{ color: 'crimson' }}>
          No se pudo cargar la lista de clientes.<br />
          <small>{String(e.message)}</small>
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Clientes</h1>

      <table
        border={1}
        cellPadding={8}
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
      >
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo doc</th>
            <th>Número doc</th>
            <th>Correo facturación</th>
            <th>WhatsApp</th>
            <th>Descuento %</th>
            <th>Creado</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(data) && data.length > 0 ? (
            data.map((row, idx) => {
              const created =
                row?.created_at
                  ? new Date(row.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                  : '—';
              return (
                <tr key={row.id ?? idx}>
                  <td>{row?.name ?? '—'}</td>
                  <td>{row?.doc_type ?? '—'}</td>
                  <td>{row?.doc_number ?? '—'}</td>
                  <td>{row?.billing_email ?? '—'}</td>
                  <td>{row?.whatsapp_phone ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {row?.discount_pct != null ? Number(row.discount_pct).toFixed(2) : '0.00'}
                  </td>
                  <td>{created}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>
                No hay clientes aún.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
