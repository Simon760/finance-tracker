const FB_URL = 'https://tracker-dxb-default-rtdb.europe-west1.firebasedatabase.app';

export async function fbGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${FB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function fbSet<T>(path: string, data: T): Promise<void> {
  await fetch(`${FB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
