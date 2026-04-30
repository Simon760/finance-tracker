const FB_URL = 'https://tracker-dxb-default-rtdb.europe-west1.firebasedatabase.app';

export async function fbGet(path) {
  const r = await fetch(`${FB_URL}/${path}.json`);
  if (!r.ok) throw new Error('Firebase GET ' + r.status);
  return r.json();
}

export async function fbSet(path, data) {
  const r = await fetch(`${FB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('Firebase PUT ' + r.status);
  return r.json();
}
