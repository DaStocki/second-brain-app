// Minimal static server for the tests (the app is plain files, no build step).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, u.endsWith('/') ? u + 'index.html' : u);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end() }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(Number(process.env.PORT || 4173));
