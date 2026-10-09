// App server: ingestor + trade store + REST snapshot + SSE push + static dashboard.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 3000;
const BSE_URL = process.env.BSE_URL || 'http://localhost:4001/getTrades';
const SSE_MAX_LIFETIME_MS = +process.env.SSE_MAX_LIFETIME_MS || 25000; // stay under the 30s network cut-off
const DATA_FILE = path.join(__dirname, '..', 'data', 'trades.json');
const PUBLIC = path.join(__dirname, 'public');

// ---------- Store (in memory, persisted to a JSON file so restarts open instantly) ----------
let seq = 0;                       // monotonically increasing version; every stored trade carries the seq it arrived in
const trades = new Map();          // tradeId -> trade (+ seq)
const pull = { state: 'idle', startedAt: null, lastCompletedAt: null, lastAdded: 0, error: null };

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  seq = saved.seq; saved.trades.forEach((t) => trades.set(t.tradeId, t));
  pull.lastCompletedAt = saved.lastCompletedAt;
  console.log(`[app] restored ${trades.size} trades (seq ${seq})`);
} catch { /* first run */ }

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify({ seq, lastCompletedAt: pull.lastCompletedAt, trades: [...trades.values()] }));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}

// ---------- SSE hub ----------
const clients = new Set();
function send(res, event, data, id) {
  res.write(`${id != null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
const broadcast = (event, data, id) => clients.forEach((c) => send(c, event, data, id));

// ---------- Ingestor: long BSE call runs server-side, detached from any browser request ----------
function startPull() {
  if (pull.state === 'pulling') return false;
  Object.assign(pull, { state: 'pulling', startedAt: new Date().toISOString(), error: null });
  broadcast('pull', pull);
  console.log('[app] pull started');

  const fail = (e) => { Object.assign(pull, { state: 'error', error: e.message }); console.error('[app] pull failed:', e.message); broadcast('pull', pull); };
  // No timeout: this is a server-to-server call that is allowed to take ~15 minutes.
  const req = http.get(BSE_URL, { timeout: 0 }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) throw new Error('BSE returned HTTP ' + res.statusCode);
        const incoming = JSON.parse(Buffer.concat(chunks).toString()).trades;
        const fresh = [];
        for (const t of incoming) if (!trades.has(t.tradeId)) fresh.push(t);
        if (fresh.length) {
          seq += 1;
          fresh.forEach((t) => { t.seq = seq; trades.set(t.tradeId, t); });
        }
        Object.assign(pull, { state: 'idle', lastCompletedAt: new Date().toISOString(), lastAdded: fresh.length });
        persist();
        console.log(`[app] pull complete: ${fresh.length} new trades, total ${trades.size}`);
        if (fresh.length) broadcast('trades', fresh, seq);
        broadcast('pull', pull);
      } catch (e) { fail(e); }
    });
  });
  req.on('error', fail);
  return true;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  // Snapshot of what we already have: answers instantly, even mid-pull.
  if (req.method === 'GET' && url.pathname === '/api/trades') {
    const after = +url.searchParams.get('after') || 0;
    return json(res, 200, { seq, pull, trades: [...trades.values()].filter((t) => t.seq > after) });
  }

  // Manual trigger. Returns immediately (202); the work happens in the background.
  if (req.method === 'POST' && url.pathname === '/api/pull') {
    return json(res, 202, { started: startPull(), pull });
  }

  // Server-Sent Events. Closed by the server every ~25s; the browser reconnects automatically
  // and sends Last-Event-ID, so anything missed in the gap is replayed.
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 500\n\n');
    const last = +(req.headers['last-event-id'] || url.searchParams.get('after') || 0);
    const missed = [...trades.values()].filter((t) => t.seq > last);
    if (missed.length) send(res, 'trades', missed, seq);
    send(res, 'pull', pull);
    clients.add(res);
    const bye = setTimeout(() => res.end(), SSE_MAX_LIFETIME_MS);
    req.on('close', () => { clearTimeout(bye); clients.delete(res); });
    return;
  }

  // Static dashboard
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(PUBLIC, path.normalize(file));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => {
  console.log(`[app] dashboard on http://localhost:${PORT}`);
  startPull(); // one pull on boot, so a fresh deployment fills itself; later pulls via the button / POST /api/pull
});
