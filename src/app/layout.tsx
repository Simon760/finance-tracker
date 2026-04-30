import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppProvider';

export const metadata: Metadata = {
  title: 'FinanceHQ',
  description: 'Cockpit financier personnel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
