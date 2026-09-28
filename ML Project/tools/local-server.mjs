import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, url === '/' ? 'index.html' : url);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const ports = [5173, 4173, 3000, 8081, 0];

function listen(index = 0) {
  const port = ports[index];
  server.once('error', (error) => {
    if ((error.code === 'EADDRINUSE' || error.code === 'EACCES') && index < ports.length - 1) {
      listen(index + 1);
      return;
    }
    throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`Worklytix running at http://127.0.0.1:${address.port}`);
  });
}

listen();
