// Serves dist/ locally and screenshots the main pages with Electron.
//   <path-to-electron> scripts/screenshots.cjs [outDir]
// (Shellby's repo has Electron: ..\shellby\node_modules\electron\dist\electron.exe)
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'dist');
const OUT = path.resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(require('os').tmpdir(), 'shellby-site'));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(fs.readFileSync(path.join(ROOT, '404.html'))); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

app.on('window-all-closed', () => {}); // keep running between shots
app.whenReady().then(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  fs.mkdirSync(OUT, { recursive: true });
  const shots = [
    ['home', '', 1280, 2600],
    ['pack', 'pack/deep-sea/', 1280, 1500],
    ['studio', 'studio/', 1280, 1200],
    ['create', 'create/', 1280, 1400],
    ['home-mobile', '', 390, 2200],
  ];
  const errors = [];
  for (const [name, url, w, h] of shots) {
    const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { offscreen: false } });
    win.webContents.on('console-message', e => { if (e.level === 'error' || e.level === 'warning') errors.push(`${name}: ${e.message}`); });
    win.webContents.on('did-fail-load', (_e, code, desc, u) => errors.push(`${name}: load failed ${code} ${desc} ${u}`));
    win.webContents.on('will-navigate', (_e, u) => errors.push(`${name}: navigating to ${u}`));
    try { await win.loadURL(base + url); } catch (e) { errors.push(`${name}: ${e.message}`); }
    await wait(1800);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log('shot', path.join(OUT, `${name}.png`));
    win.destroy();
  }
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
  server.close();
  app.quit();
});
