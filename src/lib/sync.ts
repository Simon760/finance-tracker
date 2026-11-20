/**
 * Relecture au retour dans l'app. L'état est restauré depuis la copie locale à
 * l'ouverture d'une page, et chaque sauvegarde envoie l'état ENTIER : un appareil resté
 * ouvert (ou rouvert) sur une vieille copie écrasait donc ce qui avait été saisi ailleurs
 * dès sa première modification. On relit donc la version en ligne au montage et à chaque
 * retour au premier plan, et on l'adopte si elle est plus récente.
 *
 * Ce n'est PAS une fusion : s'il reste des modifications locales non envoyées (`dirty`),
 * la copie locale est gardée telle quelle (comportement d'avant). La détection de conflit
 * reste à faire (lot « sécurité & synchro »).
 */
export function shouldAdoptRemote(localUpdate: string | undefined, remoteUpdate: string | undefined, dirty: boolean): boolean {
  if (dirty || !remoteUpdate) return false;
  if (!localUpdate) return true;
  return remoteUpdate > localUpdate; // horodatages ISO (UTC) : l'ordre des chaînes est l'ordre du temps
}

/**
 * Des modifications locales étaient marquées « non envoyées », mais la version en ligne
 * porte exactement le même horodatage : l'envoi était bien arrivé (onglet fermé avant la
 * réponse). On peut lever le marqueur.
 */
export function sendWasDelivered(localUpdate: string | undefined, remoteUpdate: string | undefined): boolean {
  return !!localUpdate && localUpdate === remoteUpdate;
}
