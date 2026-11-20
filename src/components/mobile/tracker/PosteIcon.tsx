'use client';

import {
  Home, ShoppingCart, Utensils, Car, Plane, Dumbbell, HeartPulse, Smartphone, Repeat, Receipt, PiggyBank, Landmark,
  ShoppingBag, Wine, Gift, Scissors, Sparkles, Wallet, GraduationCap, PawPrint, Baby, Coffee, Zap, Briefcase, CircleDashed,
  type LucideIcon,
} from 'lucide-react';
import { CAT_COLORS } from '@/lib/constants';
import { MIcon } from '../ui';

/** Mot-clé du nom (sans accents) → icône. Le premier qui correspond gagne. */
const RULES: [RegExp, LucideIcon][] = [
  [/LOYER|LOGEMENT|APPART|HOTEL|AIRBNB/, Home],
  [/COURSE|EPICERIE|SUPERMARCH|CARREFOUR|GROCER/, ShoppingCart],
  [/RESTO|RESTAU|FOOD|LIVRAISON|DELIVEROO|REPAS|BOUFFE/, Utensils],
  [/CAFE|COFFEE/, Coffee],
  [/TAXI|UBER|CAREEM|TRANSPORT|ESSENCE|VOITURE|PARKING|SALIK|METRO/, Car],
  [/VOYAGE|AVION|VOL\b|TRIP|VACANCE/, Plane],
  [/SPORT|GYM|FITNESS|PADEL/, Dumbbell],
  [/SANTE|MEDEC|PHARMA|ASSURANCE|MUTUELLE|DENT/, HeartPulse],
  [/TEL|MOBILE|INTERNET|WIFI|FORFAIT/, Smartphone],
  [/ABO|SUBSCRIPTION|NETFLIX|SPOTIFY|SAAS|LOGICIEL/, Repeat],
  [/ELEC|DEWA|EAU\b|ENERGIE|GAZ/, Zap],
  [/CHARGE|FACTURE|FRAIS/, Receipt],
  [/EPARGNE|INVEST|BOURSE|CRYPTO|PEA/, PiggyBank],
  [/IMPOT|TAXE|URSSAF|BANQUE|CREDIT|PRET/, Landmark],
  [/SHOPPING|VETEMENT|FRINGUE|MODE/, ShoppingBag],
  [/SORTIE|LOISIR|BAR\b|SOIREE|CLUB/, Wine],
  [/CADEAU|GIFT/, Gift],
  [/COIFF|BEAUTE|SOIN|BARBER/, Scissors],
  [/FORMATION|ECOLE|COURS\b|LIVRE/, GraduationCap],
  [/ANIMAL|CHIEN|CHAT\b|VETO/, PawPrint],
  [/ENFANT|BEBE|CRECHE/, Baby],
  [/PRO\b|BUSINESS|SOCIETE|BUREAU/, Briefcase],
];
const BY_CAT: Record<string, LucideIcon> = { logement: Home, vital: ShoppingCart, lifestyle: Sparkles, finance: Wallet };
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Pastille d'un poste : icône devinée d'après son nom, couleur de sa catégorie. */
export default function PosteIcon({ name, cat, size = 36 }: { name: string; cat?: string; size?: number }) {
  const key = (name || '').toUpperCase().normalize('NFD').replace(DIACRITICS, '');
  const Icon = RULES.find(([re]) => re.test(key))?.[1] || BY_CAT[cat || ''] || CircleDashed;
  return <MIcon size={size} color={CAT_COLORS[cat || ''] || undefined}><Icon size={Math.round(size * 0.47)} /></MIcon>;
}
