<<<<<<< HEAD
# Estás en la raíz del repo
git checkout main

cat > admin/app/capacity/page.jsx <<'EOF'
=======
>>>>>>> 7518f13 (fix(admin): 'use client' primero y StatusSelect como componente cliente separado)
'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

export default function Page() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    apiGet('/config/capacity').then(setCfg).catch(console.error);
  }, []);

  return (
    <div>
      <h1>Capacidad y Horarios</h1>
      <pre style={{background:'#fff', padding:16}}>
        {cfg ? JSON.stringify(cfg, null, 2) : 'Cargando...'}
      </pre>
    </div>
  );
}
EOF
