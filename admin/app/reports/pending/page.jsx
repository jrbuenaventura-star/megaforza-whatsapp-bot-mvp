async function getData(){
  const res = await fetch(process.env.NEXT_PUBLIC_API_BASE + '/reports/pendingByCustomer', { cache: 'no-store' });
  return res.json();
}
export default async function Page(){
  const data = await getData();
  const customers = Object.keys(data);
  return (
    <div>
      <h1>Pendientes por cliente y producto</h1>
      {customers.length===0 && <p>No hay pendientes.</p>}
      {customers.map(c => {
        const products = data[c];
        const names = Object.keys(products);
        return (
          <div key={c} style={{ marginBottom:'16px' }}>
            <h3>{c}</h3>
            <table border="1" cellPadding="8" style={{ borderCollapse:'collapse', background:'#fff' }}>
              <thead><tr><th>Producto</th><th>Bultos pendientes</th></tr></thead>
              <tbody>
                {names.map(n => <tr key={n}><td>{n}</td><td>{products[n]}</td></tr>)}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
