// admin/app/products/page.jsx
export const dynamic = 'force-dynamic';
import { apiGet } from '@/lib/api';

export default async function Page() {
  const products = await apiGet('/products');

  return (
    <div>
      <h1>Productos</h1>
      <table
        border="1"
        cellPadding="8"
        style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}
      >
        <thead>
          <tr>
            <th>SKU</th>
            <th>Nombre</th>
            <th>Pelletizado</th>
            <th>Precio/Bulto</th>
            <th>Activo</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(products) && products.map((p) => (
            <tr key={p.id}>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.pelletized ? 'Sí' : 'No'}</td>
              <td>{Number(p.price_per_bag ?? 0).toLocaleString('es-CO')}</td>
              <td>{p.active ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

