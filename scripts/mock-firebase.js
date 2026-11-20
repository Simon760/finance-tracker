// Faux Firebase LOCAL pour les tests navigateur : sert une copie des données, garde les
// écritures en mémoire, ne parle jamais à la vraie base.
//
//   1. node scripts/mock-firebase.js <copie-des-données.json>     (port 3999)
//   2. echo "NEXT_PUBLIC_FB_URL=http://127.0.0.1:3999" > .env.local   (jamais commité)
//   3. npm run dev, puis se connecter avec n'importe quel identifiant et le PIN TESTPIN
//   4. à la fin : supprimer .env.local
//
// GET /__stats = compteurs, /__state = état courant, /__reset = retour à la copie d'origine.
// Le fichier de données reste HORS du dépôt (il est public).
const http = require('http'); const fs = require('fs');
let state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const original = JSON.stringify(state);
const stats = { gets: 0, puts: 0, patches: 0, last: null };
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0];
  if (url === '/__stats') return res.end(JSON.stringify(stats));
  if (url === '/__reset') { state = JSON.parse(original); stats.gets = stats.puts = stats.patches = 0; return res.end('"ok"'); }
  if (url === '/__state') return res.end(JSON.stringify(state));
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'GET') {
      stats.gets++;
      if (url.endsWith('/pin.json')) return res.end(JSON.stringify('TESTPIN'));
      if (url.endsWith('/state.json')) return res.end(JSON.stringify(state));
      return res.end('null');
    }
    try {
      const data = JSON.parse(body || 'null');
      if (req.method === 'PUT' && url.endsWith('/state.json')) { state = data; stats.puts++; }
      else if (req.method === 'PATCH' && url.endsWith('/state.json')) { Object.assign(state, data); stats.patches++; }
      stats.last = req.method + ' ' + url;
    } catch (e) { res.writeHead(400); return res.end('"bad json"'); }
    res.end('{}');
  });
}).listen(3999, '127.0.0.1', () => console.log('mock firebase on 3999'));
