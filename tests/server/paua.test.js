// V3.41 — PAUA: SATU DPRK untuk seluruh operasi di Indonesia (keputusan Alex 30 Okt 2026). Data uji SINTETIS.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('paua');
const env = newEnv({ now: Date.parse('2026-10-30T13:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.setupLogin();
const OP = 'AIR-THAI-AIRASIA';
{ const s = env.sheets.MASTER_OPERATOR, h = s._data[0]; s._data.find(r => r[0] === OP)[h.indexOf('kelas')] = 'PAUA'; }
env.seed('MASTER_UNIT', 'H.UNIT', [
  { unitId: OP + '-DPS', operatorId: OP, jenisUnit: 'Stasiun', namaUnit: 'Stasiun DPS – Ngurah Rai', kodeUnit: 'DPS', provinsi: 'Bali', kabkota: 'Kab. Badung', aktif: true },
  { unitId: OP + '-CGK', operatorId: OP, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK – Soekarno-Hatta', kodeUnit: 'CGK', provinsi: 'Banten', kabkota: 'Kota Tangerang', aktif: true }]);
env.post({ action: 'authRegister', nama: 'Uji', email: 'u@paua-rekaan.id', jabatan: 'Station Manager', operatorId: OP });
{ const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === 'u@paua-rekaan.id')[h.indexOf('status')] = 'Aktif'; }
env.cache.clear(); env.post({ action: 'authRequestCode', email: 'u@paua-rekaan.id' });
const tk = env.post({ action: 'authVerify', email: 'u@paua-rekaan.id', code: env.lastCode('u@paua-rekaan.id') }).data.token;
const base = x => Object.assign({ action: 'create', sessionToken: tk, operatorId: OP, jenisOperator: 'Airlines', namaOperator: 'Thai AirAsia', kategori: '01 - Uji', skenario: 'Skenario PAUA', ancamanNilai: 5, kerentananNilai: 5, konsekuensiNilai: 5, bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2027-04-01', namaPengisi: 'U', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'SM' }, x);
const r1 = env.post(base({ unitId: OP + '-DPS' }));
T('PAUA: skenario dengan stasiun DITOLAK (satu DPRK untuk seluruh Indonesia)', !r1.ok && r1.code === 'UNIT_INVALID' && /seluruh operasi di Indonesia/.test(r1.error), r1);
const r2 = env.post(base({}));
T('PAUA: skenario tanpa stasiun tersimpan (matriks seluruh operasi)', r2.ok && env.rows('RISK_ASSESSMENT').find(x => x.riskId === r2.id).unitId === '', r2);
const b = env.post({ action: 'saveRiskBatch', sessionToken: tk, operatorId: OP, bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', batchId: 'PAUABATCH01', rows: [{ kategori: '02 - Uji', skenario: 'Paket PAUA', ancamanNilai: 4, kerentananNilai: 4, konsekuensiNilai: 4, unitId: OP + '-CGK' }] });
T('PAUA: simpan per paket dengan unit DITOLAK', !b.ok && /PAUA/.test(JSON.stringify(b)), b);
// Operator non-PAUA tetap boleh memakai unit
env.seed('MASTER_UNIT', 'H.UNIT', [{ unitId: 'BD-100-U01', operatorId: 'BD-100', jenisUnit: 'Satuan Pelayanan', namaUnit: 'Satpel Uji', kodeUnit: '', provinsi: 'Jawa Timur', kabkota: 'Surabaya', aktif: true }]);
T('non-PAUA: aturan unit tidak berubah (checkUnit_ menerima unit milik sendiri)', c.checkUnit_('BD-100', 'BD-100-U01') === null && c.checkUnit_(OP, '') === null);
T.done();
