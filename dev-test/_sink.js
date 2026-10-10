/* Throwaway sink: accepts a data URL from the browser and writes it to
   dev-test/shots/. Lets me look at the rendered page without the preview
   screenshot API, which cannot composite in this webview.
   Run:  node dev-test/_sink.js   (then POST to /put?name=foo.jpg) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'shots');
fs.mkdirSync(DIR, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/put') { res.writeHead(404); res.end('nope'); return; }

  const name = (url.searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '_');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').replace(/^data:[^,]*,/, '');
    const file = path.join(DIR, name);
    fs.writeFileSync(file, Buffer.from(raw, 'base64'));
    res.end('ok ' + name + ' ' + fs.statSync(file).size + ' bytes');
  });
}).listen(5199, '127.0.0.1', () => console.log('shot sink on http://127.0.0.1:5199'));
