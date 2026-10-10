#!/usr/bin/env node
/**
 * Zero-dependency static file server for Flipkart Label Cropper.
 *
 * The app itself is a single self-contained index.html with all libraries loaded
 * from a CDN, so there is no build step. This server exists only because browsers
 * refuse some operations (module scripts, fetch, service workers) on file:// URLs,
 * and because the default port below stays off 5173, which other projects'
 * Vite dev servers commonly take (on IPv6, so the clash is easy to miss).
 *
 * Uses only Node built-in modules - no dependencies, no node_modules folder.
 *
 *   npm run dev            # http://localhost:5174
 *   PORT=4000 npm run dev  # or: npm run dev -- --port 4000
 *   npm run dev -- --open  # also try to open a browser
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

// --- config ----------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 5174;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_PORT_TRIES = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

// --- cli args --------------------------------------------------------------

const argv = process.argv.slice(2);
function argValue(name) {
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
  const prefixed = argv.find((a) => a.startsWith(name + '='));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

/**
 * Work out which port to bind. Precedence: --port flag, then $PORT, then 5174.
 *
 * Note the deliberate validation: a bare `Number(x)` is not enough here. `PORT=0`
 * (which some tooling exports) is a truthy *string*, and `listen(0)` means "pick any
 * free port" - so the server would silently come up on a random port instead of 5174.
 */
function resolvePort() {
  const fromFlag = argValue('--port');
  const raw = fromFlag != null ? fromFlag : process.env.PORT;
  const parsed = Number(raw);
  if (
    raw != null &&
    String(raw).trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed > 0 &&
    parsed < 65536
  ) {
    return parsed;
  }
  if (raw != null && String(raw).trim() !== '') {
    log(`  Ignoring invalid port ${JSON.stringify(raw)}; using ${DEFAULT_PORT}.`);
  }
  return DEFAULT_PORT;
}

const requestedPort = resolvePort();
const shouldOpen = argv.includes('--open') || process.env.OPEN === '1';

// --- helpers ---------------------------------------------------------------

function log(line) {
  process.stdout.write(line + '\n');
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, {
    'Content-Length': payload.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    ...headers,
  });
  if (res.req && res.req.method === 'HEAD') res.end();
  else res.end(payload);
}

function notFound(res, pathname) {
  send(
    res,
    404,
    `<!doctype html><meta charset="utf-8"><title>404</title>
     <body style="font:16px/1.6 system-ui,sans-serif;padding:48px;color:#111">
     <h1 style="margin:0 0 8px">404</h1>
     <p style="color:#666">Nothing here: <code>${pathname.replace(/[<>&]/g, '')}</code></p>
     <p><a href="/" style="color:#0ea5e9">Go to Flipkart Label Cropper &rarr;</a></p>
     </body>`,
    { 'Content-Type': 'text/html; charset=utf-8' }
  );
}

/**
 * Resolve a URL pathname to a file inside ROOT.
 * Returns null if it escapes ROOT (path traversal attempt).
 */
function resolveSafe(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // Strip query-ish junk and normalise.
  decoded = decoded.split('?')[0].split('#')[0];
  const target = path.resolve(ROOT, '.' + path.posix.normalize('/' + decoded));
  const rel = path.relative(ROOT, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

async function tryFiles(candidates) {
  for (const candidate of candidates) {
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isDirectory()) {
        const index = path.join(candidate, 'index.html');
        try {
          const indexStat = await fsp.stat(index);
          if (indexStat.isFile()) return { file: index, stat: indexStat };
        } catch {
          /* no index.html in directory */
        }
        continue;
      }
      if (stat.isFile()) return { file: candidate, stat };
    } catch {
      /* try next */
    }
  }
  return null;
}

// --- request handler -------------------------------------------------------

async function handle(req, res) {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    send(res, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed', {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET, HEAD',
    });
    return;
  }

  const target = resolveSafe(url.pathname);
  if (target === null) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    log(`  403  ${url.pathname}`);
    return;
  }

  const found = await tryFiles(path.extname(target) ? [target] : [target, target + '.html']);

  if (!found) {
    notFound(res, url.pathname);
    log(`  404  ${url.pathname}  (${Date.now() - started}ms)`);
    return;
  }

  const type = MIME[path.extname(found.file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    // No-cache headers above mean an edit is visible on plain reload.
    'Content-Length': found.stat.size,
    'Last-Modified': found.stat.mtime.toUTCString(),
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    log(`  200  ${url.pathname}  HEAD`);
    return;
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(found.file);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);

  const rel = path.relative(ROOT, found.file).replace(/\\/g, '/');
  log(`  200  ${rel}  ${type.split(';')[0]}  ${found.stat.size}B  ${Date.now() - started}ms`);
}

// --- boot ------------------------------------------------------------------

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    log(`  500  ${req.url}  ${err && err.message}`);
    if (!res.headersSent) {
      send(res, 500, 'Internal server error', {
        'Content-Type': 'text/plain; charset=utf-8',
      });
    } else {
      res.destroy();
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const current = server.__port || requestedPort;
    const next = current + 1;
    if (next > requestedPort + MAX_PORT_TRIES) {
      log(`\n  Port ${requestedPort}-${requestedPort + MAX_PORT_TRIES} all in use.`);
      log(`  Try:  npm run dev -- --port 6000\n`);
      process.exit(1);
    }
    server.__port = next;
    log(`  Port ${current} is busy, trying ${next}...`);
    server.listen(next, HOST);
    return;
  }
  log(`\n  Server error: ${err.message}\n`);
  process.exit(1);
});

server.on('listening', () => {
  const { port } = server.address();
  server.__port = port;
  const url = `http://localhost:${port}/`;
  log('');
  log('  Flipkart Label Cropper dev server');
  log('  --------------------');
  log(`  Local:    ${url}`);
  log(`  Serving:  ${ROOT}`);
  log('');
  log('  No build step - index.html is served as-is, libraries come from CDNs.');
  log('  Press Ctrl+C to stop.');
  log('');

  if (shouldOpen) {
    const opener =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    execFile(opener[0], opener[1], () => {});
  }

  if (process.send) process.send('ready'); // for programmatic use
});

server.listen(requestedPort, HOST);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('\n  Stopping dev server.');
    server.close(() => process.exit(0));
    // Don't hang on keep-alive connections.
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
