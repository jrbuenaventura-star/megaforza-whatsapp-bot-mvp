'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { apiPatch } from '../../lib/api';

const OPTIONS = [
  'pending_payment',
  'processing',
  'ready',
  'delivered',
  'canceled',
];

export default function StatusSelect({ id, value }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onChange(e) {
    const status = e.target.value;
    try {
      await apiPatch(`/orders/${id}`, { status });
      startTransition(() => router.refresh());
    } catch (err) {
      alert('No se pudo actualizar el estado: ' + (err?.message || ''));
    }
  }

  return (
    <select value={value} onChange={onChange} disabled={isPending}>
      {OPTIONS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
