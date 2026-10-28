// Server tiruan untuk uji UI: menjalankan apps-script/*.gs ASLI (lewat tests/harness/gas.js)
// dengan data SINTETIS dari tests/fixtures. Endpoint bantu: /__mail?to=, /__ctl?a=reset|clearcache|log|enforce|relax
const http = require('http');
const { fx, newEnv, seedAll } = require('../server/_lib.js');
let env; const log = [];
function setStatus(email, st) { const s = env.sheets.USER_ACCESS, h = s._data[0]; s._data.find(x => x[h.indexOf('email')] === email)[h.indexOf('status')] = st; }
function reset() {
  env = newEnv({ owner: 'admin@dkp.go.id' });
  seedAll(env, { dprk: false, incidents: false });
  const kaji = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10); // Juanda: kaji ulang ≤30 hari
  env.seed('MASTER_DPRK', 'H.DPRK', fx('dprk').map(d => Object.assign({}, d, { tanggalKajiUlang: d.operatorId === 'BD-100' ? kaji : '' })));
  env.seed('LAPORAN_INSIDEN', 'INC_H', fx('incidents').map((x, i) => Object.assign({}, x, { statusVerifikasi: i < 3 ? 'Terverifikasi' : 'Baru' })));
  env.ctx.terapkanHitungUlangRisiko();
  // V3.37: unit rekaan — satu milik Juanda (BD-100), satu milik operator lain (BD-007) untuk uji pembatasan.
  env.seed('MASTER_UNIT', 'H.UNIT', [
    { unitId: 'BD-100-U01', operatorId: 'BD-100', jenisUnit: 'Satuan Pelayanan', namaUnit: 'Satpel Uji Juanda', kodeUnit: '', provinsi: 'Jawa Timur', kabkota: 'Surabaya', aktif: true },
    { unitId: 'BD-007-U01', operatorId: 'BD-007', jenisUnit: 'Satuan Pelayanan', namaUnit: 'Satpel Uji Semarang', kodeUnit: '', provinsi: 'Jawa Tengah', kabkota: 'Semarang', aktif: true },
  ]);
  env.ctx.setupLogin();
  env.post({ action: 'authRegister', nama: 'Budi Santoso', email: 'budi@juanda.co.id', jabatan: 'Kepala AVSEC', operatorId: 'BD-100' });
  env.post({ action: 'authRegister', nama: 'Sari', email: 'sari@garuda.co.id', jabatan: 'Security Manager', operatorId: 'AIR-GARUDA-INDONESIA' });
  setStatus('budi@juanda.co.id', 'Aktif');
  env.cache.clear();
}
reset();
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let body = '';
  req.on('data', c => body += c); req.on('end', () => {
    let out;
    try {
      if (u.pathname === '/__mail') out = { code: env.lastCode(u.searchParams.get('to')) };
      else if (u.pathname === '/__ctl') {
        const a = u.searchParams.get('a');
        if (a === 'reset') reset();
        if (a === 'clearcache') env.cache.clear();
        if (a === 'enforce') env.ctx.aktifkanLoginWajib();
        if (a === 'relax') env.ctx.nonaktifkanLoginWajib();
        if (a === 'rows') out = env.rows(u.searchParams.get('sheet'));
        if (a === 'log') { out = log.slice(); log.length = 0; }
        out = out || { ok: true };
      } else if (req.method === 'POST') { const p = JSON.parse(body || '{}'); log.push('POST ' + p.action); out = env.post(p); }
      else { const q = Object.fromEntries(u.searchParams.entries()); log.push('GET ' + q.action); out = env.get(q); }
    } catch (e) { out = { ok: false, error: String(e.stack || e) }; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out));
  });
}).listen(Number(process.env.PORT || 8220), () => console.log('mock-server siap di port ' + (process.env.PORT || 8220)));
