'use client';

import './globals.css';
import ErrorScreen from '@/components/ErrorScreen';

// Dernier filet : erreur dans le layout racine ou dans AppProvider lui-même. Ce fichier
// REMPLACE le layout racine, d'où <html>/<body> et l'import explicite des styles.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" data-theme="dark">
      <body className="font-sans">
        <ErrorScreen {...props} />
      </body>
    </html>
  );
}
