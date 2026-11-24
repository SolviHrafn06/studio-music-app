// Tiny static server for the app's resources folder (used by the Playwright tests).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'resources');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.mp3': 'audio/mpeg', '.png': 'image/png', '.json': 'application/json', '.wav': 'audio/wav' };
module.exports = (port) => http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d);
  });
}).listen(port);
