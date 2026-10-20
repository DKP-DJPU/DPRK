// Menjalankan semua uji Node: tests/server/*.test.js (Apps Script) dan tests/client/*.test.js (logika frontend).
// Keluar dengan kode 1 bila ada yang gagal.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = ['server', 'client'].flatMap(d => { const dir = path.join(__dirname, d); return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(dir, f)) : []; });
let bad = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) { bad.push(path.relative(__dirname, f)); console.log(out.split('\n').filter(l => !l.startsWith('LULUS')).join('\n')); }
  else console.log(out.trim().split('\n').pop());
}
console.log(bad.length ? `\n✗ ${bad.length} berkas uji gagal: ${bad.join(', ')}` : `\n✓ ${files.length} berkas uji lulus`);
process.exit(bad.length ? 1 : 0);
