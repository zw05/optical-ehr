'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InsuranceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/insurance');
  }, [router]);
  return <p className="muted">Redirecting to Settings → Insurance…</p>;
}
