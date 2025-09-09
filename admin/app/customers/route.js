// admin/app/api/proxy/customers/route.js
export async function GET() {
  try {
    const base = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');
    if (!base) {
      return new Response(JSON.stringify({ error: 'NEXT_PUBLIC_API_BASE not set' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const upstream = await fetch(`${base}/customers`, { cache: 'no-store' });

    // Pasamos tal cual el cuerpo y status del backend
    const body = await upstream.text();
    const ct = upstream.headers.get('content-type') || 'application/json';

    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': ct },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
