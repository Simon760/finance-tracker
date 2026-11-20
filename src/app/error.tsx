'use client';

import ErrorScreen from '@/components/ErrorScreen';

// Erreur de rendu hors cockpit (page de connexion).
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />;
}
