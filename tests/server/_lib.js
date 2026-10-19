// Utilitas bersama uji server. Menjalankan apps-script/*.gs ASLI di Node (lihat tests/harness/gas.js).
const fs = require('fs'), path = require('path');
const { makeEnv } = require('../harness/gas.js');
const ROOT = path.join(__dirname, '..', '..');
const FILES = ['Code.gs', 'Auth.gs', 'Pelaporan.gs'].map(f => path.join(ROOT, 'apps-script', f));
const fx = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', name + '.json'), 'utf8'));
function tester(name) {
  let ok = 0, fail = 0;
  const T = (n, c, i) => { c ? ok++ : fail++; console.log((c ? 'LULUS ' : 'GAGAL ') + n + (c ? '' : '  → ' + String(JSON.stringify(i)).slice(0, 400))); };
  T.done = () => { console.log(`\n[${name}] ${ok} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0); };
  return T;
}
const newEnv = opts => makeEnv(Object.assign({ files: FILES }, opts || {}));
// Data uji standar: operator publik + DPRK/risiko/laporan rekaan.
function seedAll(env, o) {
  o = o || {};
  env.seed('MASTER_OPERATOR', 'H.OP', fx('operators'));
  if (o.dprk !== false) env.seed('MASTER_DPRK', 'H.DPRK', fx('dprk'));
  if (o.risks !== false) env.seed('RISK_ASSESSMENT', 'H.RISK', fx('risks'));
  if (o.incidents !== false) env.seed('LAPORAN_INSIDEN', 'INC_H', fx('incidents'));
}
module.exports = { ROOT, FILES, fx, tester, newEnv, seedAll, makeEnv };
