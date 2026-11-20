// NEXT_PUBLIC_FB_URL (fichier .env.local, jamais commité) redirige l'app vers une autre
// base — sert aux tests navigateur sur une copie locale des données, pour ne JAMAIS
// toucher la base de production. Absent en CI et en production.
const FB_URL = process.env.NEXT_PUBLIC_FB_URL || 'https://tracker-dxb-default-rtdb.europe-west1.firebasedatabase.app';

export async function fbGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${FB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

/** Remplace tout le nœud. Rejette si le serveur refuse (avant : un refus passait pour un succès). */
export async function fbSet<T>(path: string, data: T): Promise<void> {
  const res = await fetch(`${FB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase PUT ${res.status}`);
}

/** Met à jour UNIQUEMENT les champs fournis du nœud (les autres ne sont pas touchés). */
export async function fbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${FB_URL}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase PATCH ${res.status}`);
}
