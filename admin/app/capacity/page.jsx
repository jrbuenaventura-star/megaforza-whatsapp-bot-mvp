export const dynamic = 'force-dynamic';
import { apiGet } from '@/lib/api';

export default async function Page() {
  const cfg = await apiGet('/config/capacity');
  return (
    <div>
      <h1>Capacidad y Horarios</h1>
      <pre style={{ background:'#f7f7f7', padding:12, borderRadius:8 }}>
        {JSON.stringify(cfg, null, 2)}
      </pre>
    </div>
  );
}
