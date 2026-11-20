'use client';

import { useEffect, useState } from 'react';

/**
 * Écran de secours affiché quand une page plante au rendu (cf. app/error.tsx,
 * app/(dashboard)/error.tsx, app/global-error.tsx). Sans lui, une exception donnait un
 * écran blanc, sans aucun moyen de récupérer ses données.
 *
 * Volontairement AUTONOME : n'utilise ni le contexte de l'app ni aucun helper métier —
 * c'est peut-être eux qui ont planté. Le bouton de téléchargement lit la copie locale
 * brute (`fdxb_state`, la même clé que AppProvider) : le fichier obtenu se réimporte tel
 * quel via Réglages → Importer JSON.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    console.error('[FinanceHQ] erreur de rendu', error);
  }, [error]);

  const download = () => {
    try {
      const raw = localStorage.getItem('fdxb_state');
      if (!raw) { setNote('Aucune copie locale des données sur cet appareil.'); return; }
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-hq-secours-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNote('Copie téléchargée.');
    } catch {
      setNote('Téléchargement impossible sur ce navigateur.');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-[460px] w-full bg-bg-2 border border-border rounded-lg p-7 max-md:p-5 text-center">
        <div className="w-11 h-11 rounded-md bg-danger/10 border border-danger/25 text-danger flex items-center justify-center font-bold text-lg mx-auto mb-4">!</div>
        <h2 className="text-[17px] font-bold tracking-tight text-t-1 mb-2">Cette page a rencontré une erreur</h2>
        <p className="text-[13px] text-t-3 leading-relaxed mb-4">
          Tes données ne sont pas touchées : elles restent enregistrées. Tu peux réessayer,
          ou télécharger une copie de sécurité avant de recharger.
        </p>
        {error?.message && (
          <pre className="text-left text-[11px] text-t-3 bg-bg border border-border rounded-sm p-3 mb-5 whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{error.message}</pre>
        )}
        <div className="flex flex-col gap-2">
          <button onClick={reset} className="px-4 py-2.5 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all cursor-pointer">
            Réessayer
          </button>
          <button onClick={download} className="px-4 py-2.5 border border-border text-t-2 text-sm rounded-sm hover:bg-bg-4 transition-all cursor-pointer font-semibold">
            Télécharger mes données
          </button>
          <button onClick={() => window.location.reload()} className="px-4 py-2.5 border border-border text-t-2 text-sm rounded-sm hover:bg-bg-4 transition-all cursor-pointer font-semibold">
            Recharger la page
          </button>
        </div>
        {note && <p className="text-[12px] text-t-3 mt-4">{note}</p>}
      </div>
    </div>
  );
}
