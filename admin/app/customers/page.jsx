async function getData(){
  const res = await fetch(process.env.NEXT_PUBLIC_API_BASE + '/customers', { cache: 'no-store' });
  return res.json();
}
export default async function Page(){
  const data = await getData();
  return (
    <div>
      <h1>Clientes</h1>
      <table border="1" cellPadding="8" style={ borderCollapse:'collapse', width:'100%', background:'#fff' }>
        <thead><tr><th>name</th><th>doc_type</th><th>doc_number</th><th>billing_email</th><th>whatsapp_phone</th><th>discount_pct</th><th>created_at</th></tr></thead>
        <tbody>
          {data.map((row,idx)=> (
            <tr key={idx}>
              <td>{row['name']?.toString?.() ?? ''}</td><td>{row['doc_type']?.toString?.() ?? ''}</td><td>{row['doc_number']?.toString?.() ?? ''}</td><td>{row['billing_email']?.toString?.() ?? ''}</td><td>{row['whatsapp_phone']?.toString?.() ?? ''}</td><td>{row['discount_pct']?.toString?.() ?? ''}</td><td>{row['created_at']?.toString?.() ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
