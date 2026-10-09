// Cross-platform launcher (Windows, macOS, Linux): starts the mock BSE API and the app together.
// Usage: node scripts/start-all.js [--demo]   (--demo = 20-second pull instead of 15 minutes)
const { spawn } = require('child_process');
const path = require('path');
const env = { ...process.env };
if (process.argv.includes('--demo')) env.BSE_DELAY_MS = env.BSE_DELAY_MS || '20000';
const run = (f) => spawn(process.execPath, [path.join(__dirname, '..', f)], { stdio: 'inherit', env });
const kids = [run('mock-bse/server.js'), run('app/server.js')];
const stop = () => kids.forEach((k) => k.kill());
process.on('SIGINT', stop); process.on('SIGTERM', stop);
kids.forEach((k) => k.on('exit', stop));
