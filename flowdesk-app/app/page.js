'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { currentUser } from '../lib/api';
export default function Home() {
  const router = useRouter();
  useEffect(() => { currentUser().then((u) => router.replace(u ? '/app' : '/login')); }, [router]);
  return <div className="center muted">กำลังโหลด…</div>;
}
