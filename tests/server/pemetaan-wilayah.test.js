// V3.43 — PEMETAAN_WILAYAH: kode wilayah resmi diterapkan lewat cekImporAdmin/terapkanImporAdmin. Provinsi & kab/kota
// diturunkan dari kode (ejaan seragam), stasiun maskapai ikut lokasi bandaranya, cadangan + audit, aman diulang.
// Data uji SINTETIS (operator dari daftar publik, stasiun rekaan).
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('pemetaan-wilayah');
const env = newEnv({ now: Date.parse('2026-11-06T09:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
const ss = c.SpreadsheetApp.getActive();
const SAJ = 'AIR-SUPER-AIR-JET', CIT = 'AIR-CITILINK-INDONESIA';
env.seed('MASTER_UNIT', 'H.UNIT', [
  { unitId: SAJ + '-CGK', operatorId: SAJ, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK', kodeUnit: 'CGK', provinsi: 'DKI Jakarta', kabkota: 'Cengkareng (Jakarta)', aktif: true },
  { unitId: CIT + '-CGK', operatorId: CIT, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK', kodeUnit: 'CGK', provinsi: 'DKI Jakarta', kabkota: 'Jakarta', aktif: true },
  { unitId: CIT + '-DPS', operatorId: CIT, jenisUnit: 'Stasiun', namaUnit: 'Stasiun DPS', kodeUnit: 'DPS', provinsi: 'Bali', kabkota: 'Denpasar', aktif: true },
  { unitId: 'LPP-001-U01', operatorId: 'LPP-001', jenisUnit: 'Unit Kerja', namaUnit: 'Unit Uji CGK', kodeUnit: 'CGK', provinsi: 'Banten', kabkota: 'Tangerang', aktif: true }]);
const op = id => env.rows('MASTER_OPERATOR').find(o => o.operatorId === id);
const unit = id => env.rows('MASTER_UNIT').find(u => u.unitId === id);
const sh = ss.insertSheet('PEMETAAN_WILAYAH');
sh.appendRow(['operatorId', 'nama (info)', 'kodeWilayah', 'provinsiSekarang', 'kabkotaSekarang', 'sumber (info)']);
const add = (id, kode, prov, kab) => sh.appendRow([id, 'info', kode, prov === undefined ? op(id).provinsi : prov, kab === undefined ? op(id).kabkota : kab, 'uji']);
add('BD-222', '36.71');        // CGK: DKI Jakarta / Cengkareng → Kota Tangerang, Banten (provinsi berubah)
add(SAJ, '36.03');             // maskapai tanpa data → Kab. Tangerang
add('RA-001', '36.03');        // "Tangerang" → Kab. Tangerang
add('BD-100', '35.15');        // Juanda → Kab. Sidoarjo
add('LPP-001', '36.71');       // sudah Banten / Kota Tangerang → hanya kodeWilayah yang bertambah
const before = JSON.stringify(env.rows('MASTER_OPERATOR'));

let m = c.cekImporAdmin();
T('cek: ringkasan pemetaan (5 operator, 2 provinsi berubah? → CGK saja), 2 stasiun CGK ikut', /PEMETAAN_WILAYAH: 5 operator diperbarui \(1 provinsi berubah\), 0 sudah sesuai; 2 stasiun maskapai ikut lokasi bandaranya/.test(m) && /Pemeriksaan bersih/.test(m), m);
T('cek tidak mengubah master', JSON.stringify(env.rows('MASTER_OPERATOR')) === before);

// --- galat yang memblokir
sh.appendRow(['BD-999-TIDAK-ADA', '', '36.71', '', '', '']);
sh.appendRow(['BD-024', '', '99.99', '', '', '']);
sh.appendRow([SAJ, '', '36.71', '', '', '']);
m = c.cekImporAdmin();
T('operator tidak ada / kode di luar daftar / operatorId ganda → MASALAH', /MASALAH/.test(m) && /BD-999-TIDAK-ADA tidak ada/.test(m) && /99\.99/.test(m) && /operatorId ganda/.test(m), m);
sh._data.splice(-3, 3);
// pengaman "sekarang": master berubah setelah daftar dibuat
const opSh = env.sheets.MASTER_OPERATOR, oh = opSh._data[0], juanda = opSh._data.find(r => r[oh.indexOf('operatorId')] === 'BD-100');
const kab0 = juanda[oh.indexOf('kabkota')]; juanda[oh.indexOf('kabkota')] = 'Kota Surabaya';
m = c.cekImporAdmin();
T('lokasi master berubah sejak daftar dibuat → MASALAH "periksa ulang"', /BD-100 sekarang "Kota Surabaya/.test(m) && /periksa ulang/.test(m), m);
juanda[oh.indexOf('kabkota')] = kab0;

// --- terapkan
const audit0 = env.rows('AUDIT_LOG').length;
m = c.terapkanImporAdmin();
T('terapkan: cadangan lalu SELESAI', /Cadangan sebelum impor: Backup/.test(m) && /SELESAI/.test(m), m.slice(-400));
T('CGK: Kota Tangerang, Banten, 36.71 (nama dari daftar resmi)', op('BD-222').provinsi === 'Banten' && op('BD-222').kabkota === 'Kota Tangerang' && op('BD-222').kodeWilayah === '36.71', op('BD-222'));
T('Super Air Jet & RA-001 → Kab. Tangerang 36.03; Juanda → Kab. Sidoarjo 35.15', op(SAJ).kabkota === 'Kab. Tangerang' && op(SAJ).kodeWilayah === '36.03' && op('RA-001').kabkota === 'Kab. Tangerang' && op('BD-100').kabkota === 'Kab. Sidoarjo' && op('BD-100').kodeWilayah === '35.15');
T('kolom lain tidak tersentuh (lokasi, nama, createdAt)', op('BD-222').lokasi === JSON.parse(before).find(o => o.operatorId === 'BD-222').lokasi && op('BD-222').namaOperator === 'Soekarno-Hatta');
T('stasiun CGK (SAJ & Citilink) ikut bandara: Kota Tangerang 36.71', [SAJ + '-CGK', CIT + '-CGK'].every(id => unit(id).kabkota === 'Kota Tangerang' && unit(id).provinsi === 'Banten' && unit(id).kodeWilayah === '36.71'), [unit(SAJ + '-CGK'), unit(CIT + '-CGK')]);
T('stasiun DPS (bandara tidak dipetakan) & unit kerja LPPNPI tidak tersentuh', unit(CIT + '-DPS').kabkota === 'Denpasar' && unit('LPP-001-U01').kabkota === 'Tangerang');
const aud = env.rows('AUDIT_LOG').slice(audit0).filter(a => /PEMETAAN_WILAYAH/.test(a.reason));
T('AUDIT_LOG: satu baris per entitas (5 operator + 2 stasiun) dengan nilai sebelum', aud.length === 7 && aud.some(a => a.entityId === 'BD-222' && /Cengkareng/.test(a.beforeData)), aud.length);

// --- aman diulang
m = c.cekImporAdmin();
T('cek ulang: 0 diperbarui, 5 sudah sesuai, 0 stasiun', /PEMETAAN_WILAYAH: 0 operator diperbarui \(0 provinsi berubah\), 5 sudah sesuai; 0 stasiun/.test(m), m);
const unitBefore = JSON.stringify(env.rows('MASTER_UNIT'));
c.terapkanImporAdmin();
T('terapkan ulang tidak mengubah apa pun', JSON.stringify(env.rows('MASTER_UNIT')) === unitBefore);

// --- kode wilayah tetap teks walau unit lain diimpor ulang (V3.37.2 tulis massal)
const iu = ss.insertSheet('IMPOR_UNIT');
iu.appendRow(['unitId', 'operatorId', 'jenisUnit', 'namaUnit', 'kodeUnit', 'provinsi', 'kabkota']);
iu.appendRow([CIT + '-DPS', CIT, 'Stasiun', 'Stasiun DPS – I Gusti Ngurah Rai', 'DPS', 'Bali', 'Denpasar']);
ss.deleteSheet ? ss.deleteSheet(sh) : sh._data.splice(1);
m = c.terapkanImporAdmin();
const raw = env.sheets.MASTER_UNIT._data, uh = raw[0], cell = raw.find(r => r[uh.indexOf('unitId')] === SAJ + '-CGK')[uh.indexOf('kodeWilayah')];
T('impor unit lain: kodeWilayah stasiun CGK tetap "36.71" (teks)', /1 unit diperbarui/.test(m) && String(cell).replace(/^'/, '') === '36.71' && typeof cell === 'string', [m.slice(0, 300), cell]);
T('publik: kodeWilayah ikut di daftar operator', env.get({ action: 'operators' }).data.find(o => o.operatorId === 'BD-222').kodeWilayah === '36.71');
// --- bandara lama Nonaktif dengan IATA sama (produksi: LNU, LPU, RTU, PPR) tidak menjadi rujukan stasiun
{ const o = opSh._data.find(r => r[oh.indexOf('operatorId')] === 'BD-024');
  o[oh.indexOf('iata')] = 'CGK'; o[oh.indexOf('status')] = 'Nonaktif'; o[oh.indexOf('aktif')] = false;
  const p2 = ss.insertSheet('PEMETAAN_WILAYAH'); p2.appendRow(['operatorId', 'kodeWilayah']); p2.appendRow(['BD-222', '36.71']); p2.appendRow(['BD-024', '96.01']);
  const mm = c.cekImporAdmin();
  T('bandara Nonaktif ber-IATA sama: dipetakan sendiri, stasiun CGK tetap ikut bandara aktif (0 berubah)', /PEMETAAN_WILAYAH: 1 operator diperbarui \(1 provinsi berubah\), 1 sudah sesuai; 0 stasiun/.test(mm) && /Pemeriksaan bersih/.test(mm), mm); }
T.done();
