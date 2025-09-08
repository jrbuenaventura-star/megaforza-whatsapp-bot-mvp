// admin/app/reports/pending/page.js
'use client';

import { useEffect, useState } from 'react';

// Toma el backend del env; si no está, cae a /api (mismo dominio del backend si
// el admin y el backend comparten host/proxy)
const BASE = (process.env.NEXT_PUBLIC_API_BASE || '/api').replace(/\/+$/, '');

function useApi(url) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status} ${text || ''}`.trim());
        }
        return r.json();
      })
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [url]);

  return { data, error, loading, refresh: () => {} };
}

function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>{title}</h2>
      {children}
    </div>
  );
}

function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div style={{ marginTop: 8, padding: 12, borderRadius: 6, background: '#fff3f3', color: '#a30000', fontSize: 13 }}>
      <strong>Error:</strong> {String(error.message || error)}
    </div>
  );
}

function Table({ columns = [], rows = [] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        border={1}
        cellPadding={8}
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left', whiteSpace: 'nowrap' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.isArray(rows) && rows.length > 0 ? (
            rows.map((r, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                    {c.render ? c.render(r[c.key], r) : (r[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: '#666' }}>
                (sin datos)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PendingPage() {
  const { data: byCustomer, error: eCust, loading: lCust } = useApi(`${BASE}/reports/pendingByCustomer`);
  const { data: byProduct,  error: eProd, loading: lProd } = useApi(`${BASE}/reports/pendingByProduct`);

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0, marginBottom: 8 }}>Pendientes</h1>
      <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
        Fuente: {BASE.replace(/^https?:\/\//, '')}/reports/…
      </div>

      <Card title="Por producto (bultos pendientes)">
        {lProd ? <p>Cargando…</p> : <Table
          columns={[
            { key: 'product', label: 'Producto' },
            { key: 'qty_bags', label: 'Bultos pendientes', align: 'right', render: (v) => Number(v || 0).toLocaleString('es-CO') },
          ]}
          rows={Array.isArray(byProduct) ? byProduct : []}
        />}
        <ErrorBox error={eProd} />
      </Card>

      <Card title="Por cliente y producto (bultos pendientes)">
        {lCust ? <p>Cargando…</p> : <Table
          columns={[
            { key: 'customer', label: 'Cliente' },
            { key: 'product', label: 'Producto' },
            { key: 'qty_bags', label: 'Bultos pendientes', align: 'right', render: (v) => Number(v || 0).toLocaleString('es-CO') },
          ]}
          rows={Array.isArray(byCustomer) ? byCustomer : []}
        />}
        <ErrorBox error={eCust} />
      </Card>
    </div>
  );
}
