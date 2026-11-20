'use client';

import { Check } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import BottomSheet from './BottomSheet';
import { MCard, MIcon, MRow } from './ui';

/** Choix de l'espace actif — ouvert depuis l'avatar de la barre du haut et depuis Menu. */
export default function SpaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaces, activeSpace, setActiveSpaceId } = useApp();
  return (
    <BottomSheet open={open} onClose={onClose} title="Espaces">
      <MCard surface="sheet">
        {spaces.map(s => {
          const active = s.id === activeSpace?.id;
          return (
            <MRow
              key={s.id}
              icon={<MIcon className="!bg-bg-4">{s.emoji || s.name[0]}</MIcon>}
              title={s.name}
              sub={`${s.localCurrency} · ${s.status === 'active' ? 'Actif' : s.status === 'archived' ? 'Archivé' : 'Brouillon'}`}
              right={active ? <Check size={18} className="text-accent inline" /> : undefined}
              onClick={() => { setActiveSpaceId(s.id); onClose(); }}
            />
          );
        })}
      </MCard>
    </BottomSheet>
  );
}
