'use client';

import ErrorScreen from '@/components/ErrorScreen';

// Erreur de rendu dans une page du cockpit : la navigation (sidebar / onglets) reste en
// place, seule la zone de contenu affiche l'écran de secours.
export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />;
}
