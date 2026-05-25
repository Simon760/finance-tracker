'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import Sidebar from '@/components/layout/Sidebar';
import MobileShell from '@/components/mobile/MobileShell';
import { useIsMobile } from '@/lib/useIsMobile';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useApp();
  const router = useRouter();
  const isMobile = useIsMobile();

  useEffect(() => {
    const uid = localStorage.getItem('fdxb_uid');
    if (!isLoggedIn && !uid) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  // Pendant le SSR / 1er render : layout desktop par défaut (évite flash)
  if (isMobile === true) {
    return <MobileShell>{children}</MobileShell>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-7 px-8 max-md:ml-0 max-md:p-4 max-md:pt-16">
        {children}
      </main>
    </div>
  );
}
