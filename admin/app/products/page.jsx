async function getData(){
  const res = await fetch(process.env.NEXT_PUBLIC_API_BASE + '/products', { cache: 'no-store' });
  return res.json();
}
async function updatePrice(id, formData){
  'use server'
  const price = formData.get('price');
  await fetch(process.env.NEXT_PUBLIC_API_BASE + '/products/' + id, {
    method:'PATCH',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ price_per_bag: Number(price) })
  });
}
export default async function Page(){
  const data = await getData();
  return (
    <div>
      <h1>Productos</h1>
      <table border="1" cellPadding="8" style={{ borderCollapse:'collapse', width:'100%', background:'#fff' }}>
        <thead><tr><th>SKU</th><th>Nombre</th><th>Pelletizado</th><th>Precio por bulto</th></tr></thead>
        <tbody>
          {data.map((row)=> (
            <tr key={row.id}>
              <td>{row.sku}</td>
              <td>{row.name}</td>
              <td>{row.pelletized? 'Sí':'No'}</td>
              <td>
                <form action={updatePrice.bind(null, row.id)}>
                  <input type="number" step="0.01" name="price" defaultValue={row.price_per_bag} />
                  <button type="submit">Guardar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
