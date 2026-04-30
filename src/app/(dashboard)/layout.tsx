'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useApp();
  const router = useRouter();

  useEffect(() => {
    const uid = localStorage.getItem('fdxb_uid');
    if (!isLoggedIn && !uid) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-7 px-8 max-md:ml-0 max-md:p-4">
        {children}
      </main>
    </div>
  );
}
