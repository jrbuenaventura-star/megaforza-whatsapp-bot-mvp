export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', margin: 0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', minHeight:'100vh' }}>
          <aside style={{ background:'#0b1f3b', color:'#fff', padding:'16px' }}>
            <h2>Megaforza Admin</h2>
            <nav style={{ display:'grid', gap:'8px', marginTop:'24px' }}>
              <a href="/" style={{ color:'#fff' }}>Dashboard</a>
              <a href="/products" style={{ color:'#fff' }}>Productos</a>
              <a href="/customers" style={{ color:'#fff' }}>Clientes</a>
              <a href="/orders" style={{ color:'#fff' }}>Pedidos</a>
              <a href="/capacity" style={{ color:'#fff' }}>Capacidad</a>
              <a href="/reports/pending" style={{ color:'#fff' }}>Pendientes</a>
            </nav>
          </aside>
          <main style={{ padding:'24px' }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
