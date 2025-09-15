'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch } from '@/lib/api';

const OPTIONS = [
  { v: 'pending_payment', l: 'pending_payment' },
  { v: 'processing',      l: 'processing' },
  { v: 'ready',           l: 'ready' },
  { v: 'delivered',       l: 'delivered' },
  { v: 'canceled',        l: 'canceled' },
];

export default function StatusSelect({ id, value }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onChange(e) {
    const status = e.target.value;
    try {
      await apiPatch(`/orders/${id}`, { status });
      startTransition(() => router.refresh()); // refetch de la tabla
    } catch (err) {
      console.error('PATCH /orders/:id', err);
      alert('No se pudo actualizar el estado');
    }
  }

  return (
    <select defaultValue={value} onChange={onChange} disabled={isPending}>
      {OPTIONS.map(o => (
        <option key={o.v} value={o.v}>{o.l}</option>
      ))}
    </select>
  );
}
