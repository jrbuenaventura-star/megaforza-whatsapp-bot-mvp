'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch } from '@/lib/api';

// Estados canónicos que entiende el backend
const OPTIONS = [
  'pending_payment',
  'processing',
  'ready',
  'delivered',
  'canceled',
];

export default function StatusSelect({ order }) {
  const [value, setValue] = useState(order.status);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function onChange(e) {
    const next = e.target.value;
    const prev = value;
    setValue(next); // optimista

    try {
      await apiPatch(`/orders/${order.id}`, { status: next });
      // refresca la tabla SSR para que quede consistente
      startTransition(() => router.refresh());
    } catch (err) {
      alert(`Error actualizando: ${err.message}`);
      setValue(prev); // rollback
    }
  }

  return (
    <select value={value} onChange={onChange} disabled={isPending}>
      {OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
