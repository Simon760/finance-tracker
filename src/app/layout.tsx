import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppProvider';
import { DialogProvider } from '@/components/ui/Dialog';

// Les fichiers de public/ sont servis sous le basePath en production (GitHub Pages).
const base = process.env.NODE_ENV === 'production' ? '/finance-tracker' : '';

export const metadata: Metadata = {
  title: 'FinanceHQ',
  description: 'Cockpit financier personnel',
  // App installable (« Sur l'écran d'accueil ») : plein écran, icône, nom court.
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' }],
    apple: [{ url: `${base}/icons/apple-touch-icon.png`, sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'FinanceHQ', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

// viewport-fit=cover : le contenu passe sous l'encoche, les zones sûres sont gérées par
// le shell mobile (env(safe-area-inset-*)). La couleur de barre suit le thème (script
// ci-dessous + AppProvider), celle-ci n'est que la valeur de départ.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

// Posé AVANT le premier paint :
//  - data-theme, sinon un utilisateur en mode jour voit l'app s'afficher en sombre le
//    temps que React monte (clé alignée sur THEME_KEY dans AppProvider) ;
//  - data-ui (mobile / desktop), pour que le CSS cache le squelette desktop pré-rendu
//    sur téléphone et applique les règles tactiles sans attendre React. Mêmes règles
//    que useIsMobile (768px, vue desktop forcée par ?desktop=1 ou fdxb_force_desktop).
const themeInit = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('fhq_theme')==='light'?'light':'dark';d.setAttribute('data-theme',t);var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute('content',t==='light'?'#f0f2f5':'#09090b');}catch(e){d.setAttribute('data-theme','dark');}try{var q=location.search;if(/[?&]desktop=1/.test(q))localStorage.setItem('fdxb_force_desktop','1');else if(/[?&]desktop=0/.test(q))localStorage.removeItem('fdxb_force_desktop');var m=localStorage.getItem('fdxb_force_desktop')!=='1'&&window.matchMedia('(max-width: 768px)').matches;d.setAttribute('data-ui',m?'mobile':'desktop');}catch(e){d.setAttribute('data-ui','desktop');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">
        {/* DialogProvider au-dessus d'AppProvider : ce dernier ouvre aussi des confirmations */}
        <DialogProvider><AppProvider>{children}</AppProvider></DialogProvider>
      </body>
    </html>
  );
}
