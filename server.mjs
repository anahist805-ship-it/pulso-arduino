import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const allowed = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'text/javascript; charset=utf-8'],
  ['/protocol.js', 'text/javascript; charset=utf-8'],
  ['/signal.js', 'text/javascript; charset=utf-8'],
]);
const server = http.createServer(async (request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  const file = route === '/' ? '/index.html' : route;
  if (!allowed.has(file)) {
    response.writeHead(404);
    response.end('No encontrado');
    return;
  }
  try {
    const bytes = await readFile(path.join(root, file));
    response.writeHead(200, {
      'Content-Type': allowed.get(file),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(bytes);
  } catch {
    response.writeHead(500);
    response.end('No se pudo abrir el archivo.');
  }
});
const flagValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const port = Number(flagValue('--port') || process.env.PORT || 3010);
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `El puerto ${port} está ocupado. Cierra la otra ventana del monitor e inténtalo otra vez.`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, flagValue('--host') || process.env.HOST || '0.0.0.0', () => {
  console.log(`\n  PULSO · Monitor de Arduino\n  Abre http://localhost:${port}\n  Para detener: Ctrl + C\n`);
});
