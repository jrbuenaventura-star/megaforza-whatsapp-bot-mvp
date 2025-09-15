export const dynamic = 'force-dynamic';
'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

const DEFAULTS = {
  pellet_bph: 200,
  non_pellet_bph: 300,
  workday_start: '08:00',
  workday_end: '17:00',
  workdays: 'Mon,Tue,Wed,Thu,Fri,Sat',
  timezone: 'America/Bogota',
  dispatch_buffer_min: 60,
};

export default function Page() {
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    apiGet('/config/capacity')
      .then((cfg) => {
        if (!mounted) return;
        setForm({
          pellet_bph: Number(cfg?.pellet_bph ?? DEFAULTS.pellet_bph),
          non_pellet_bph: Number(cfg?.non_pellet_bph ?? DEFAULTS.non_pellet_bph),
          workday_start: cfg?.workday_start ?? DEFAULTS.workday_start,
          workday_end: cfg?.workday_end ?? DEFAULTS.workday_end,
          workdays: cfg?.workdays ?? DEFAULTS.workdays,
          timezone: cfg?.timezone ?? DEFAULTS.timezone,
          dispatch_buffer_min: Number(cfg?.dispatch_buffer_min ?? DEFAULTS.dispatch_buffer_min),
        });
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      // normaliza números y strings
      const payload = {
        pellet_bph: Number(form.pellet_bph) || 0,
        non_pellet_bph: Number(form.non_pellet_bph) || 0,
        workday_start: String(form.workday_start || '').trim(),
        workday_end: String(form.workday_end || '').trim(),
        workdays: String(form.workdays || '').replace(/\s+/g, ''),
        timezone: String(form.timezone || '').trim(),
        dispatch_buffer_min: Number(form.dispatch_buffer_min) || 0,
      };
      const saved = await apiPost('/config/capacity', payload);
      setMsg({ type: 'ok', text: 'Guardado ✔️' });
      // refresca con lo que regresó el backend
      setForm({
        pellet_bph: Number(saved?.pellet_bph ?? payload.pellet_bph),
        non_pellet_bph: Number(saved?.non_pellet_bph ?? payload.non_pellet_bph),
        workday_start: saved?.workday_start ?? payload.workday_start,
        workday_end: saved?.workday_end ?? payload.workday_end,
        workdays: saved?.workdays ?? payload.workdays,
        timezone: saved?.timezone ?? payload.timezone,
        dispatch_buffer_min: Number(saved?.dispatch_buffer_min ?? payload.dispatch_buffer_min),
      });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error guardando' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Cargando…</div>;

  return (
    <div className="max-w-3xl">
      <h1>Capacidad y Horarios</h1>

      <form onSubmit={onSave} style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            <div>Bultos/hora (pelletizado)</div>
            <input
              type="number"
              name="pellet_bph"
              value={form.pellet_bph}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Bultos/hora (no pelletizado)</div>
            <input
              type="number"
              name="non_pellet_bph"
              value={form.non_pellet_bph}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Jornada inicia (HH:mm)</div>
            <input
              type="time"
              name="workday_start"
              value={form.workday_start}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Jornada termina (HH:mm)</div>
            <input
              type="time"
              name="workday_end"
              value={form.workday_end}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Días hábiles (CSV)</div>
            <input
              type="text"
              name="workdays"
              placeholder="Mon,Tue,Wed,Thu,Fri,Sat"
              value={form.workdays}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Timezone</div>
            <input
              type="text"
              name="timezone"
              placeholder="America/Bogota"
              value={form.timezone}
              onChange={onChange}
            />
          </label>

          <label>
            <div>Buffer despacho (minutos)</div>
            <input
              type="number"
              name="dispatch_buffer_min"
              value={form.dispatch_buffer_min}
              onChange={onChange}
            />
          </label>

          <button disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      {msg && (
        <p style={{ marginTop: 12, color: msg.type === 'error' ? 'crimson' : 'green' }}>
          {msg.text}
        </p>
      )}

      <pre style={{ marginTop: 16, background: '#f5f6f8', padding: 12, borderRadius: 8 }}>
        {JSON.stringify(form, null, 2)}
      </pre>
    </div>
  );
}
