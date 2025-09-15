'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { api } from '../../lib/api';

const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function Page() {
  const [cfg, setCfg] = useState(null);
  const [saving, startTransition] = useTransition();
  const [msg, setMsg] = useState('');

  // Carga inicial
  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/config/capacity', { method: 'GET' });
        // Normaliza workdays a array
        const workdaysArr = (data?.workdays || 'Mon,Tue,Wed,Thu,Fri,Sat').split(',').filter(Boolean);
        setCfg({
          pellet_bph: Number(data?.pellet_bph ?? 200),
          non_pellet_bph: Number(data?.non_pellet_bph ?? 300),
          workday_start: data?.workday_start ?? '08:00',
          workday_end: data?.workday_end ?? '17:00',
          workdays: workdaysArr,
          timezone: data?.timezone ?? 'America/Bogota',
          dispatch_buffer_min: Number(data?.dispatch_buffer_min ?? 60),
        });
      } catch (e) {
        console.error(e);
        setMsg('Error cargando configuración');
      }
    })();
  }, []);

  const canSave = useMemo(() => !!cfg, [cfg]);

  const toggleDay = (d) => {
    setCfg((prev) => {
      const set = new Set(prev.workdays);
      set.has(d) ? set.delete(d) : set.add(d);
      return { ...prev, workdays: Array.from(set) };
    });
  };

  const update = (field, value) => setCfg((prev) => ({ ...prev, [field]: value }));

  const onSubmit = (e) => {
    e.preventDefault();
    if (!cfg) return;
    setMsg('');
    startTransition(async () => {
      try {
        const payload = {
          ...cfg,
          workdays: cfg.workdays.join(','), // el backend espera string
        };
        await api('/api/config/capacity', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('✅ Guardado');
      } catch (e) {
        console.error(e);
        setMsg('❌ Error guardando');
      }
    });
  };

  if (!cfg) {
    return <div style={{ padding: 24 }}>Cargando…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Capacidad y Horarios</h1>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18 }}>
        <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Capacidad (bultos por hora)</h2>
          <div style={{ display: 'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
            <label>
              Pelletizados (pellet_bph)
              <input
                type="number"
                min={0}
                value={cfg.pellet_bph}
                onChange={(e)=>update('pellet_bph', Number(e.target.value))}
                style={fieldStyle}
              />
            </label>
            <label>
              No pelletizados (non_pellet_bph)
              <input
                type="number"
                min={0}
                value={cfg.non_pellet_bph}
                onChange={(e)=>update('non_pellet_bph', Number(e.target.value))}
                style={fieldStyle}
              />
            </label>
          </div>
        </section>

        <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Horario laboral (por defecto)</h2>
          <div style={{ display: 'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 12 }}>
            <label>
              Inicio (workday_start)
              <input
                type="time"
                value={cfg.workday_start}
                onChange={(e)=>update('workday_start', e.target.value)}
                style={fieldStyle}
              />
            </label>
            <label>
              Fin (workday_end)
              <input
                type="time"
                value={cfg.workday_end}
                onChange={(e)=>update('workday_end', e.target.value)}
                style={fieldStyle}
              />
            </label>
            <label>
              Zona horaria (timezone)
              <input
                type="text"
                value={cfg.timezone}
                onChange={(e)=>update('timezone', e.target.value)}
                placeholder="America/Bogota"
                style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Días hábiles (workdays)</div>
            <div style={{ display:'flex', gap: 10, flexWrap:'wrap' }}>
              {ALL_DAYS.map((d)=>(
                <label key={d} style={{ display:'inline-flex', gap: 6, alignItems:'center',
                  padding:'6px 10px', border:'1px solid #ddd', borderRadius: 8, background:'#fafafa' }}>
                  <input
                    type="checkbox"
                    checked={cfg.workdays.includes(d)}
                    onChange={()=>toggleDay(d)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Despacho</h2>
          <label>
            Buffer de despacho (minutos) – <code>dispatch_buffer_min</code>
            <input
              type="number"
              min={0}
              value={cfg.dispatch_buffer_min}
              onChange={(e)=>update('dispatch_buffer_min', Number(e.target.value))}
              style={fieldStyle}
            />
          </label>
        </section>

        <div style={{ display:'flex', gap: 12, alignItems:'center' }}>
          <button
            type="submit"
            disabled={!canSave || saving}
            style={{
              padding:'10px 16px',
              background:'#0ea5e9',
              color:'white',
              border:'none',
              borderRadius:10,
              cursor:'pointer',
              opacity: saving ? .7 : 1
            }}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && <span>{msg}</span>}
        </div>
      </form>
    </div>
  );
}

const fieldStyle = {
  display:'block',
  marginTop:6,
  width:'100%',
  padding:'8px 10px',
  border:'1px solid #ddd',
  borderRadius:8,
  fontSize:14,
  background:'#fff'
};
