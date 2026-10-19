// Menjalankan semua uji server (tests/server/*.test.js). Keluar dengan kode 1 bila ada yang gagal.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'server');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
let bad = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) { bad.push(f); console.log(out.split('\n').filter(l => !l.startsWith('LULUS')).join('\n')); }
  else console.log(out.trim().split('\n').pop());
}
console.log(bad.length ? `\n✗ ${bad.length} berkas uji gagal: ${bad.join(', ')}` : `\n✓ ${files.length} berkas uji server lulus`);
process.exit(bad.length ? 1 : 0);
