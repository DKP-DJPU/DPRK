// Server tiruan untuk uji UI: menjalankan apps-script/*.gs ASLI (lewat tests/harness/gas.js)
// dengan data SINTETIS dari tests/fixtures. Endpoint bantu: /__mail?to=, /__ctl?a=reset|clearcache|log|enforce|relax|simunit|putususul
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
// V3.38: data simulasi LPP-004 + 3 unit (REKAAN) — Oktober 2026 Induk 4, Solo 3, Cilacap 2; Januari 2027 Solo kaji ulang 3.
function simUnit() {
  const KAT = Object.fromEntries(require('../../data/katalog-risiko.json').kategori), OP = 'LPP-004';
  const us = env.sheets.MASTER_UNIT, uh = us._data[0];
  [['LPP-004-U01', 'Unit Kerja', 'Unit Adisutjipto', 'JOG', 'DI Yogyakarta', 'Yogyakarta'], ['LPP-004-U02', 'Kantor Cabang Pembantu', 'Cabang Pembantu Solo', 'SOC', 'Jawa Tengah', 'Solo'], ['LPP-004-U03', 'Kantor Cabang Pembantu', 'Cabang Pembantu Cilacap', 'CXP', 'Jawa Tengah', 'Cilacap']]
    .forEach(u => us.appendRow(uh.map(k => ({ unitId: u[0], operatorId: OP, jenisUnit: u[1], namaUnit: u[2], kodeUnit: u[3], provinsi: u[4], kabkota: u[5], aktif: true })[k] ?? '')));
  env.post({ action: 'authRegister', nama: 'Petugas Uji', email: 'uji@airnav-rekaan.id', jabatan: 'Manager Keamanan', operatorId: OP });
  setStatus('uji@airnav-rekaan.id', 'Aktif');
  env.cache.clear(); env.post({ action: 'authRequestCode', email: 'uji@airnav-rekaan.id' });
  const tk = env.post({ action: 'authVerify', email: 'uji@airnav-rekaan.id', code: env.lastCode('uji@airnav-rekaan.id') }).data.token;
  const sv = (unitId, kode, sk, a, k, c, bulan, tahun) => env.post({ action: 'create', sessionToken: tk, operatorId: OP, jenisOperator: 'LPPNPI', namaOperator: 'AirNav Indonesia Cabang Yogyakarta (Kulonprogo)', unitId, kategori: kode + ' - ' + KAT[kode], skenario: sk, ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: c, bulan, tahun, tanggalPengesahan: tahun + '-01-10', tanggalKaji: '2027-07-01', namaPengisi: 'Petugas Uji', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'GM Cabang' });
  [['', '11', 'Siber ATC', 8, 7, 9], ['', '15', 'Penyusupan ruang peralatan', 6, 6, 8], ['', '03', 'Drone pendekatan', 7, 6, 7], ['', '14', 'Bom palsu telepon', 5, 4, 4],
   ['LPP-004-U02', '15', 'Penyusupan ruang peralatan', 5, 7, 8], ['LPP-004-U02', '16', 'Sabotase catu daya radar', 6, 7, 9], ['LPP-004-U02', '14', 'Bom palsu telepon', 4, 4, 4],
   ['LPP-004-U03', '15', 'Penyusupan ruang peralatan', 4, 5, 6], ['LPP-004-U03', '04', 'Unjuk rasa sisi darat', 3, 3, 4]].forEach(p => sv(p[0], p[1], p[2], p[3], p[4], p[5], 'Oktober', 2026));
  [['LPP-004-U02', '15', 'Penyusupan ruang peralatan', 4, 5, 6], ['LPP-004-U02', '16', 'Sabotase catu daya radar', 5, 5, 7], ['LPP-004-U02', '14', 'Bom palsu telepon', 3, 3, 3]].forEach(p => sv(p[0], p[1], p[2], p[3], p[4], p[5], 'Januari', 2027));
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
        if (a === 'simunit') simUnit();
        if (a === 'putususul') { // V3.42: Admin memutuskan semua usulan Menunggu lalu menjalankan terapkanUsulanLokasi()
          const sh = env.sheets.USULAN_LOKASI, h = sh._data[0];
          sh._data.slice(1).forEach(r => { if (r[h.indexOf('status')] === 'Menunggu' && !r[h.indexOf('diputuskanAt')]) { r[h.indexOf('status')] = u.searchParams.get('status'); r[h.indexOf('alasan')] = u.searchParams.get('alasan') || ''; } });
          out = { pesan: env.ctx.terapkanUsulanLokasi() };
        }
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
