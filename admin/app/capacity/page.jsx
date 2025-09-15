"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

// pequeña ayuda para convertir el arreglo de días en texto y viceversa si hicieras eso en DB
const normalizeWorkdays = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(",");

export default function Page() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet("/config/capacity");
        // normaliza a string simple para el input
        setCfg({
          pellet_bph: Number(data?.pellet_bph ?? 0),
          non_pellet_bph: Number(data?.non_pellet_bph ?? 0),
          workday_start: data?.workday_start ?? "08:00",
          workday_end: data?.workday_end ?? "17:00",
          workdays: normalizeWorkdays(data?.workdays ?? "Mon,Tue,Wed,Thu,Fri,Sat"),
          timezone: data?.timezone ?? "America/Bogota",
          dispatch_buffer_min: Number(data?.dispatch_buffer_min ?? 60),
        });
      } catch (e) {
        console.error(e);
        setMsg("No se pudo cargar la configuración.");
      }
    })();
  }, []);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        pellet_bph: Number(cfg.pellet_bph),
        non_pellet_bph: Number(cfg.non_pellet_bph),
        workday_start: cfg.workday_start,
        workday_end: cfg.workday_end,
        workdays: normalizeWorkdays(cfg.workdays),
        timezone: cfg.timezone,
        dispatch_buffer_min: Number(cfg.dispatch_buffer_min),
      };
      const saved = await apiPost("/config/capacity", payload);
      setMsg("Guardado ✅");
      // re-sincroniza vista con lo que quedó en backend
      setCfg((c) => ({ ...c, ...saved }));
    } catch (e) {
      console.error(e);
      setMsg("Error guardando 😕");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return <div className="p-6">Cargando…</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>
        Capacidad y Horarios
      </h1>

      <form onSubmit={onSave} style={{ display: "grid", gap: 16 }}>
        <label>
          <div>Pellet (bolsas/hora)</div>
          <input
            type="number"
            value={cfg.pellet_bph}
            onChange={(e) => setCfg({ ...cfg, pellet_bph: e.target.value })}
          />
        </label>

        <label>
          <div>No pellet (bolsas/hora)</div>
          <input
            type="number"
            value={cfg.non_pellet_bph}
            onChange={(e) => setCfg({ ...cfg, non_pellet_bph: e.target.value })}
          />
        </label>

        <label>
          <div>Inicio jornada (HH:mm)</div>
          <input
            type="text"
            value={cfg.workday_start}
            onChange={(e) => setCfg({ ...cfg, workday_start: e.target.value })}
          />
        </label>

        <label>
          <div>Fin jornada (HH:mm)</div>
          <input
            type="text"
            value={cfg.workday_end}
            onChange={(e) => setCfg({ ...cfg, workday_end: e.target.value })}
          />
        </label>

        <label>
          <div>Días hábiles (csv, ej. Mon,Tue,Wed,Thu,Fri,Sat)</div>
          <input
            type="text"
            value={cfg.workdays}
            onChange={(e) => setCfg({ ...cfg, workdays: e.target.value })}
          />
        </label>

        <label>
          <div>Timezone</div>
          <input
            type="text"
            value={cfg.timezone}
            onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })}
          />
        </label>

        <label>
          <div>Buffer despacho (minutos)</div>
          <input
            type="number"
            value={cfg.dispatch_buffer_min}
            onChange={(e) =>
              setCfg({ ...cfg, dispatch_buffer_min: e.target.value })
            }
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>

        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      </form>
    </div>
  );
}
