/**
 * Static server for the preview harness. Run with `npm run serve`.
 *
 * It exists for one reason: `Cache-Control: no-store`. A generic static server
 * happily serves a cached `src/utils/i18n.js` next to a freshly edited
 * `_locales/es/messages.json`, and the resulting mix looks like a bug in the
 * code rather than a stale file. Cache-busting query strings do not help,
 * because they cannot reach the imports inside an ES module.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2]) || 8777;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

const server = createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = resolve(root, `.${normalize(requested)}`);

  // Never serve outside the project, whatever the path tries.
  if (!target.startsWith(resolve(root))) {
    response.writeHead(403).end('forbidden');
    return;
  }

  const file = existsSync(target) && statSync(target).isDirectory()
    ? join(target, 'index.html')
    : target;

  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store, must-revalidate'
  });

  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} on http://127.0.0.1:${port} (no-store)\n`);
  console.log('  popup    http://127.0.0.1:%d/tools/preview.html?page=popup&scenario=idle', port);
  console.log('  running  http://127.0.0.1:%d/tools/preview.html?page=popup&scenario=running', port);
  console.log('  blocked  http://127.0.0.1:%d/tools/preview.html?page=blocked&scenario=repeat', port);
  console.log('  summary  http://127.0.0.1:%d/tools/preview.html?page=summary', port);
  console.log('\n  add &locale=pt_BR or &locale=es to preview a translation');
});
