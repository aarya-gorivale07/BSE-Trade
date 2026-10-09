// Mock BSE Exchange API.
// GET /getTrades holds the connection for BSE_DELAY_MS (default 15 min) then returns every trade.
// Each call returns a few more trades than the last, so a completed pull visibly adds data.
const http = require('http');

const PORT = +process.env.MOCK_PORT || 4001;
const DEFAULT_DELAY = +process.env.BSE_DELAY_MS || 15 * 60 * 1000;
const BASE_TRADES = +process.env.BSE_BASE_TRADES || 3000;
const GROWTH = +process.env.BSE_GROWTH_PER_PULL || 150;

const SYMBOLS = { RELIANCE: 2900, TCS: 4100, INFY: 1650, HDFCBANK: 1700, ICICIBANK: 1250, SBIN: 820,
  ITC: 480, LT: 3600, BHARTIARTL: 1500, AXISBANK: 1180, MARUTI: 12500, TATAMOTORS: 980 };
const CLIENTS = ['Aarav Capital', 'Bhavin Securities', 'Kaveri Wealth', 'Dalal Street Partners',
  'Meridian Funds', 'Sahyadri Asset Mgmt', 'Nilgiri Trading', 'Orion Proprietary', 'Zenith Brokers', 'Indus Fund'];

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Deterministic: trade i is always identical, so repeated pulls overlap and only the tail is new.
function makeTrade(i) {
  const r = mulberry32(i * 7919 + 13);
  const symbols = Object.keys(SYMBOLS);
  const symbol = symbols[Math.floor(r() * symbols.length)];
  const price = +(SYMBOLS[symbol] * (0.97 + r() * 0.06)).toFixed(2);
  const ts = Date.UTC(2026, 9, 1, 3, 45) + i * 9000 + Math.floor(r() * 8000); // from ~09:15 IST
  return { tradeId: 'T' + String(i + 1).padStart(7, '0'), client: CLIENTS[Math.floor(r() * CLIENTS.length)],
    symbol, quantity: (1 + Math.floor(r() * 50)) * 10, price, timestamp: new Date(ts).toISOString() };
}

let calls = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/getTrades') {
    const delay = url.searchParams.has('delayMs') ? +url.searchParams.get('delayMs') : DEFAULT_DELAY;
    const n = BASE_TRADES + calls++ * GROWTH;
    console.log(`[bse] /getTrades -> holding ${delay}ms, will return ${n} trades`);
    const t = setTimeout(() => {
      const trades = Array.from({ length: n }, (_, i) => makeTrade(i));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: trades.length, trades }));
      console.log(`[bse] responded with ${n} trades`);
    }, delay);
    req.on('close', () => clearTimeout(t)); // client gave up (e.g. network killed it)
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`[bse] mock listening on :${PORT}, default delay ${DEFAULT_DELAY / 1000}s`));
