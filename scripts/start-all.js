// Convenience launcher: starts the mock BSE API and the app together.
const { spawn } = require('child_process');
const path = require('path');
const run = (f) => spawn(process.execPath, [path.join(__dirname, '..', f)], { stdio: 'inherit', env: process.env });
const kids = [run('mock-bse/server.js'), run('app/server.js')];
const stop = () => kids.forEach((k) => k.kill());
process.on('SIGINT', stop); process.on('SIGTERM', stop);
kids.forEach((k) => k.on('exit', stop));
