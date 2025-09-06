import CustomersTable from './CustomersTable';

async function getData() {
  // Llama al proxy interno (mismo dominio del dashboard)
  const res = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL ? 'https://' + process.env.NEXT_PUBLIC_VERCEL_URL : ''}/api/proxy/customers`, {
    cache: 'no-store',
  }).catch(() => null);

  // Fallback por si NEXT_PUBLIC_VERCEL_URL no existe (Vercel lo pone solo en algunos casos)
  const finalRes = res ?? await fetch('/api/proxy/customers', { cache: 'no-store' });

  if (!finalRes.ok) {
    const text = await finalRes.text().catch(() => finalRes.statusText);
    throw new Error(`Error ${finalRes.status}: ${text}`);
  }
  return finalRes.json();
}

export default async function Page() {
  let data = [];
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
    <div>
      <h1 style={{ padding: 16 }}>Clientes</h1>
      <CustomersTable initial={Array.isArray(data) ? data : []} />
    </div>
  );
}
