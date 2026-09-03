import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppProvider';

export const metadata: Metadata = {
  title: 'FinanceHQ',
  description: 'Cockpit financier personnel',
};

// Pose data-theme AVANT le premier paint, sinon un utilisateur en mode jour voit
// l'app s'afficher en sombre le temps que React monte. La clé doit rester
// alignée sur THEME_KEY dans AppProvider.
const themeInit = `(function(){try{var t=localStorage.getItem('fhq_theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
