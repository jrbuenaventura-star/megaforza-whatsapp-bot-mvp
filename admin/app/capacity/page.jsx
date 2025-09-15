cat > admin/app/capacity/page.jsx <<'EOF'
'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

export default function Page() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/config/capacity');
        setCfg(data || {});
      } catch (e) {
        console.error(e);
        setMsg('Error cargando configuración');
      }
    })();
  }, []);

  function update(field, value) {
    setCfg((prev) => ({ ...(prev || {}), [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!cfg) return;

    setSaving(true);
    setMsg('');

    try {
      // Normaliza numéricos
      const payload = {
        pellet_bph: Number(cfg.pellet_bph || 0),
        non_pellet_bph: Number(cfg.non_pellet_bph || 0),
        workday_start: String(cfg.workday_start || ''),
        workday_end: String(cfg.workday_end || ''),
        workdays: String(cfg.workdays || ''),
        timezone: String(cfg.timezone || ''),
        dispatch_buffer_min: Number(cfg.dispatch_buffer_min || 0),
      };

      const saved = await apiPost('/config/capacity', payload);
      setCfg(saved);
      setMsg('Guardado ✅');
    } catch (e) {
      console.error(e);
      setMsg('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Capacidad y Horarios</h1>

      {msg && (
        <div style={{ margin: '12px 0', padding: 10, background: '#eef' }}>
          {msg}
        </div>
      )}

      {!cfg ? (
        <p>Cargando…</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label>
            <div>Pellet (bolsas/hora)</div>
            <input
              type="number"
              value={cfg.pellet_bph ?? ''}
              onChange={(e) => update('pellet_bph', e.target.value)}
            />
          </label>

          <label>
            <div>No pellet (bolsas/hora)</div>
            <input
              type="number"
              value={cfg.non_pellet_bph ?? ''}
              onChange={(e) => update('non_pellet_bph', e.target.value)}
            />
          </label>

          <label>
            <div>Inicio jornada (HH:mm)</div>
            <input
              type="text"
              placeholder="08:00"
              value={cfg.workday_start ?? ''}
              onChange={(e) => update('workday_start', e.target.value)}
            />
          </label>

          <label>
            <div>Fin jornada (HH:mm)</div>
            <input
              type="text"
              placeholder="17:00"
              value={cfg.workday_end ?? ''}
              onChange={(e) => update('workday_end', e.target.value)}
            />
          </label>

          <label>
            <div>Días laborables (CSV)</div>
            <input
              type="text"
              placeholder="Mon,Tue,Wed,Thu,Fri,Sat"
              value={cfg.workdays ?? ''}
              onChange={(e) => update('workdays', e.target.value)}
            />
          </label>

          <label>
            <div>Timezone</div>
            <input
              type="text"
              placeholder="America/Bogota"
              value={cfg.timezone ?? ''}
              onChange={(e) => update('timezone', e.target.value)}
            />
          </label>

          <label>
            <div>Buffer despacho (min)</div>
            <input
              type="number"
              value={cfg.dispatch_buffer_min ?? ''}
              onChange={(e) => update('dispatch_buffer_min', e.target.value)}
            />
          </label>

          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}

      {/* Bloque de debug debajo, por si quieres ver el JSON crudo */}
      <pre style={{
        marginTop: 20, background: '#f3f5f7', padding: 16, borderRadius: 8, overflow: 'auto'
      }}>
        {JSON.stringify(cfg, null, 2)}
      </pre>
    </div>
  );
}
EOF
