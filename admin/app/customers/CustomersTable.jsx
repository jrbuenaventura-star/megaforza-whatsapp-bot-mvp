'use client';

import { useMemo, useState } from 'react';

export default function CustomersTable({ initial = [] }) {
  const [rows, setRows] = useState(initial);
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState(null);

  // Base del backend (Render). Debe existir NEXT_PUBLIC_API_BASE en Vercel.
  const base = useMemo(() => {
    const b = process.env.NEXT_PUBLIC_API_BASE ?? '';
    return b.replace(/\/+$/, ''); // sin trailing slash
  }, []);

  const onChangePct = (id, value) => {
    setRows((curr) =>
      curr.map((r) =>
        r.id === id ? { ...r, discount_pct: value } : r
      )
    );
  };

  const saveOne = async (row) => {
    setSavingId(row.id);
    setMsg(null);
    try {
      const pct = Number(row.discount_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new Error('El descuento debe estar entre 0 y 100.');
      }

      const res = await fetch(`${base}/customers/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount_pct: pct }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
      }

      setMsg('✔ Guardado');
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg(`⚠️ Error: ${String(e.message || e)}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 8, color: msg?.startsWith('✔') ? 'green' : 'crimson' }}>
        {msg}
      </div>

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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => {
              const created = row?.created_at
                ? new Date(row.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                : '—';

              return (
                <tr key={row.id}>
                  <td>{row?.name ?? '—'}</td>
                  <td>{row?.doc_type ?? '—'}</td>
                  <td>{row?.doc_number ?? '—'}</td>
                  <td>{row?.billing_email ?? '—'}</td>
                  <td>{row?.whatsapp_phone ?? '—'}</td>
                  <td style={{ textAlign: 'right', minWidth: 120 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={
                        row?.discount_pct != null
                          ? String(row.discount_pct)
                          : '0'
                      }
                      onChange={(e) => onChangePct(row.id, e.target.value)}
                      style={{ width: 90, textAlign: 'right' }}
                    />{' '}
                    %
                  </td>
                  <td>{created}</td>
                  <td>
                    <button
                      onClick={() => saveOne(row)}
                      disabled={savingId === row.id || !base}
                    >
                      {savingId === row.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', color: '#666' }}>
                No hay clientes aún.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
