import CustomersTable from './CustomersTable';

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
