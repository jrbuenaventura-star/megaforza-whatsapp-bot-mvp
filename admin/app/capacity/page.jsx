import { apiGet } from '../../lib/api';

export const dynamic = 'force-dynamic'; // evita cacheos en dev/build

async function getConfig() {
  // OJO: apiGet ya antepone `/api` y usa NEXT_PUBLIC_API_BASE
  return apiGet('/config/capacity');
}

export default async function Page() {
  let cfg = null;
  let error = null;

  try {
    cfg = await getConfig();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Capacidad y Horarios
      </h1>

      {error ? (
        <div style={{ color: '#b91c1c', marginTop: 12 }}>
          No se pudo cargar la configuración.
          <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 6, marginTop: 8 }}>
{error}
          </pre>
        </div>
      ) : (
        <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 6 }}>
{JSON.stringify(cfg, null, 2)}
        </pre>
      )}
    </div>
  );
}
export const dynamic = 'force-dynamic';

import { apiGet } from '@/lib/api';

async function getConfig() {
  return apiGet('/config/capacity');
}

export default async function Page() {
  const cfg = await getConfig();

  return (
    <div>
      <h1>Capacidad y Horarios</h1>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '16px',
          borderRadius: '8px',
          overflowX: 'auto',
        }}
      >
        {JSON.stringify(cfg, null, 2)}
      </pre>
    </div>
  );
}
