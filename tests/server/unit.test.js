// V3.37 (P5 fondasi): impor Admin (operator/PAUA, perbaikan master, unit), unit pada skenario,
// unitList, saveRiskBatch (impor matriks per paket). Semua data uji SINTETIS.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('unit');
const env = newEnv({ now: Date.parse('2026-10-28T03:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.terapkanHitungUlangRisiko(); c.setupLogin();
const ss = c.SpreadsheetApp.getActive();
const stage = (name, header, rows) => { const old = env.sheets[name]; if (old) ss.deleteSheet(old); const s = ss.insertSheet(name); s.appendRow(header); rows.forEach(r => s.appendRow(r)); };
const ops = () => env.rows('MASTER_OPERATOR'), units = () => env.rows('MASTER_UNIT');
const login = email => { env.cache.clear(); env.post({ action: 'authRequestCode', email }); return env.post({ action: 'authVerify', email, code: env.lastCode(email) }).data.token; };
const activate = (email, op) => { env.post({ action: 'authRegister', nama: 'Uji', email, jabatan: 'AVSEC', operatorId: op }); const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === email)[h.indexOf('status')] = 'Aktif'; };

// ================= IMPOR ADMIN =================
T('tanpa sheet impor → pesan jelas, tidak ada perubahan', /Tidak ada sheet/.test(c.cekImporAdmin()));
const OPH = ['operatorId', 'jenisOperator', 'namaOperator', 'kodeOperator', 'iata', 'icao', 'provinsi', 'kabkota', 'lokasi (negara asal)', 'kelas', 'status', 'aktif', 'Keterangan (tidak diimpor)'];
stage('IMPOR_OPERATOR', OPH, [
  ['AIR-PAUA-SATU', 'Airlines', 'Maskapai Asing Satu', '', '', '', '', '', 'Negara A', 'PAUA', 'Aktif', true, 'BARU'],
  ['AIR-PAUA-DUA', 'Airlines', 'Maskapai Asing Dua', '', '', '', '', '', 'Negara B', 'PAUA', 'Nonaktif', false, 'Tidak beroperasi'],
  ['AIR-THAI-AIRASIA', 'Airlines', 'Thai AirAsia', '', '', '', '', '', 'Thailand', 'PAUA', 'Aktif', true, 'SUDAH ADA'],
  ['AIR-SALAH', 'Maskapai', 'Jenis salah', '', '', '', '', '', '', '', 'Aktif', true, ''],
]);
stage('PERBAIKAN_MASTER', ['operatorId', 'Bandara', 'Kolom', 'Nilai sekarang', 'Nilai baru', 'Dasar'], [
  ['BD-277', 'Dekai', 'iata', 'DEK', 'DEX', 'uji'], ['BD-277', 'Dekai', 'kodeOperator', 'DEK', 'DEX', 'uji'],
  ['BD-207', 'Kolaka', 'iata', 'SALAH', 'KXB', 'uji'], ['BD-207', 'Kolaka', 'jenisOperator', 'Bandar Udara', 'Airlines', 'uji'],
]);
const UH = ['unitId', 'operatorId (induk DPRK)', 'Nama operator induk', 'jenisUnit', 'namaUnit', 'kodeUnit (IATA)', 'provinsi', 'kabkota', 'Lokasi acuan (bandara di master)', 'Cek', 'Catatan'];
stage('IMPOR_UNIT', UH, [
  ['LPP-011-U01', 'LPP-011', 'x', 'Kantor Cabang Pembantu', 'Cabang Pembantu Banyuwangi', 'BWX', 'Jawa Timur', 'Banyuwangi', '', 'OK', ''],
  ['LPP-011-U02', 'LPP-011', 'x', 'Unit Kerja', 'Unit Kediri', 'DHX', 'Jawa Timur', 'Kediri', '', 'OK', ''],
  ['AIR-GARUDA-INDONESIA-SUB', 'AIR-GARUDA-INDONESIA', 'x', 'Stasiun', 'Stasiun SUB', 'SUB', 'Jawa Timur', 'Surabaya', '', 'OK', ''],
  ['AIR-GARUDA-INDONESIA-DPS', 'AIR-GARUDA-INDONESIA', 'x', 'Stasiun', 'Stasiun DPS', 'DPS', 'Bali', 'Badung', '', 'OK', ''],
  ['AIR-PAUA-SATU-DPS', 'AIR-PAUA-SATU', 'x', 'Stasiun', 'Stasiun DPS', 'DPS', 'Bali', 'Badung', '', 'OK', ''],
  ['LPP-011-U03', 'LPP-999', 'x', 'Unit Kerja', 'Induk tidak ada', '', '', '', '', '', ''],
  ['LPP-011-U04', 'LPP-011', 'x', 'Kantor Cabang', 'Jenis salah', '', '', '', '', '', ''],
  ['LPP-011-U01', 'LPP-011', 'x', 'Unit Kerja', 'Ganda', '', '', '', '', '', ''],
]);
const before = ops().length;
let m = c.cekImporAdmin();
T('cek: semua masalah dilaporkan (jenis operator, nilai sekarang beda, kolom terlarang, induk tidak ada, jenis unit, unit ganda)',
  /AIR-SALAH|jenisOperator/.test(m) && /BD-207\.iata sekarang "SQR", bukan "SALAH"/.test(m) && /kolom jenisOperator tidak boleh/.test(m) && /LPP-999/.test(m) && /jenisUnit harus/.test(m) && /unitId ganda/.test(m), m);
m = c.terapkanImporAdmin();
T('terapkan dengan masalah → TIDAK ada yang diubah', ops().length === before && units().length === 0 && /tidak ada yang diterapkan/.test(m), m);
// perbaiki staging
stage('IMPOR_OPERATOR', OPH, [
  ['AIR-PAUA-SATU', 'Airlines', 'Maskapai Asing Satu', '', '', '', '', '', 'Negara A', 'PAUA', 'Aktif', true, 'BARU'],
  ['AIR-PAUA-DUA', 'Airlines', 'Maskapai Asing Dua', '', '', '', '', '', 'Negara B', 'PAUA', 'Nonaktif', false, 'Tidak beroperasi'],
  ['AIR-THAI-AIRASIA', 'Airlines', 'Thai AirAsia', '', '', '', '', '', 'Thailand', 'PAUA', 'Aktif', true, 'SUDAH ADA'],
]);
stage('PERBAIKAN_MASTER', ['operatorId', 'Bandara', 'Kolom', 'Nilai sekarang', 'Nilai baru', 'Dasar'], [
  ['BD-277', 'Dekai', 'iata', 'DEK', 'DEX', 'uji'], ['BD-277', 'Dekai', 'kodeOperator', 'DEK', 'DEX', 'uji'], ['BD-207', 'Kolaka', 'iata', 'SQR', 'KXB', 'uji'],
]);
stage('IMPOR_UNIT', UH, [
  ['LPP-011-U01', 'LPP-011', 'x', 'Kantor Cabang Pembantu', 'Cabang Pembantu Banyuwangi', 'BWX', 'Jawa Timur', 'Banyuwangi', '', 'OK', ''],
  ['LPP-011-U02', 'LPP-011', 'x', 'Unit Kerja', 'Unit Kediri', 'DHX', 'Jawa Timur', 'Kediri', '', 'OK', ''],
  ['AIR-GARUDA-INDONESIA-SUB', 'AIR-GARUDA-INDONESIA', 'x', 'Stasiun', 'Stasiun SUB', 'SUB', 'Jawa Timur', 'Surabaya', '', 'OK', ''],
  ['AIR-GARUDA-INDONESIA-DPS', 'AIR-GARUDA-INDONESIA', 'x', 'Stasiun', 'Stasiun DPS', 'DPS', 'Bali', 'Badung', '', 'OK', ''],
  ['AIR-PAUA-SATU-DPS', 'AIR-PAUA-SATU', 'x', 'Stasiun', 'Stasiun DPS', 'DPS', 'Bali', 'Badung', '', 'OK', ''],
]);
m = c.cekImporAdmin();
T('cek bersih → ringkasan jumlah, belum ada perubahan', /2 operator baru \(1 aktif\), 1 operator lama dilengkapi/.test(m) && /3 perubahan/.test(m) && /5 unit baru/.test(m) && /Pemeriksaan bersih/.test(m) && ops().length === before, m);
const dash0 = env.get({ action: 'dashboard' }).data.kpi.totalEntities;
m = c.terapkanImporAdmin();
const o = ops(), byId = Object.fromEntries(o.map(x => [x.operatorId, x]));
T('terapkan: 2 PAUA masuk master (1 Aktif, 1 Nonaktif), kelas PAUA, negara di lokasi', o.length === before + 2 && byId['AIR-PAUA-SATU'].kelas === 'PAUA' && byId['AIR-PAUA-SATU'].aktif === true && byId['AIR-PAUA-DUA'].aktif === false && byId['AIR-PAUA-DUA'].status === 'Nonaktif' && byId['AIR-PAUA-SATU'].lokasi === 'Negara A', [byId['AIR-PAUA-SATU'], byId['AIR-PAUA-DUA']]);
T('terapkan: operator lama hanya dilengkapi kolom kosong (Thai AirAsia kelas = PAUA, nama tetap)', byId['AIR-THAI-AIRASIA'].kelas === 'PAUA' && byId['AIR-THAI-AIRASIA'].namaOperator === 'Thai AirAsia');
T('terapkan: perbaikan kode bandara (DEK→DEX iata & kode, SQR→KXB)', byId['BD-277'].iata === 'DEX' && byId['BD-277'].kodeOperator === 'DEX' && byId['BD-207'].iata === 'KXB');
T('terapkan: 5 unit di MASTER_UNIT dengan kolom benar (judul kolom bertambahan dikenali)', units().length === 5 && units().find(u => u.unitId === 'AIR-GARUDA-INDONESIA-SUB').kabkota === 'Surabaya' && units().every(u => u.aktif === true || u.aktif === 'true'), units()[0]);
T('dashboard: Total Operator naik 1 (PAUA nonaktif tidak dihitung)', env.get({ action: 'dashboard' }).data.kpi.totalEntities === dash0 + 1);
T('cadangan spreadsheet dibuat otomatis sebelum impor diterapkan', /Cadangan sebelum impor: Backup .* selesai/.test(m) && Object.values(env.drive.files).filter(f => /^SI-RISK BACKUP /.test(f._name)).length === 1, m);
T('audit mencatat impor admin + email pemilik script', env.rows('AUDIT_LOG').some(a => a.entityType === 'UNIT' && a.action === 'BATCH_UPSERT' && /ADMIN_IMPORT:owner@dkp.go.id/.test(a.actorId)));
m = c.terapkanImporAdmin();
T('dijalankan ulang: tidak menggandakan (0 operator baru, perbaikan sudah diterapkan dilewati, unit diperbarui)', ops().length === before + 2 && units().length === 5 && /0 operator baru/.test(m) && /0 perubahan/.test(m) && /0 unit baru, 5 unit diperbarui/.test(m), m);
stage('IMPOR_UNIT', UH, [['LPP-011-U01', 'LPP-012', 'x', 'Unit Kerja', 'Pindah induk', '', '', '', '', '', '']]);
T('unit tidak boleh pindah operator induk', /tidak boleh berubah/.test(c.cekImporAdmin()));
// --- status operator & unit nonaktif (V3.37 perbaikan 28 Okt)
stage('IMPOR_UNIT', UH, []);
const PMH = ['operatorId', 'Bandara', 'Kolom', 'Nilai sekarang', 'Nilai baru', 'Dasar'];
env.cache.clear(); const tot0 = env.get({ action: 'dashboard' }).data.kpi.totalEntities;
stage('PERBAIKAN_MASTER', PMH, [['AIR-BBN-AIRLINES-INDONESIA', 'BBN', 'status', 'Aktif', 'Nonaktif', 'berhenti Feb 2025']]);
m = c.terapkanImporAdmin();
let bbn = ops().find(x => x.operatorId === 'AIR-BBN-AIRLINES-INDONESIA');
env.cache.clear();
T('PERBAIKAN_MASTER status Aktif→Nonaktif: status & aktif selaras, Total Operator turun 1, baris tetap ada', bbn.status === 'Nonaktif' && bbn.aktif === false && env.get({ action: 'dashboard' }).data.kpi.totalEntities === tot0 - 1, [bbn, m]);
T('perubahan status tercatat di AUDIT_LOG', env.rows('AUDIT_LOG').some(a => a.entityType === 'OPERATOR' && a.entityId === 'AIR-BBN-AIRLINES-INDONESIA' && /status/.test(a.reason)));
stage('PERBAIKAN_MASTER', PMH, [['AIR-BBN-AIRLINES-INDONESIA', 'BBN', 'aktif', 'FALSE', 'TRUE', 'aktif lagi']]);
c.terapkanImporAdmin(); bbn = ops().find(x => x.operatorId === 'AIR-BBN-AIRLINES-INDONESIA');
T('PERBAIKAN_MASTER aktif FALSE→TRUE: diaktifkan kembali (status ikut Aktif)', bbn.aktif === true && bbn.status === 'Aktif', bbn);
stage('PERBAIKAN_MASTER', PMH, [['AIR-BBN-AIRLINES-INDONESIA', 'BBN', 'status', 'Aktif', 'Tutup', 'x']]);
T('status selain Aktif/Nonaktif ditolak', /status harus Aktif atau Nonaktif/.test(c.cekImporAdmin()));
stage('PERBAIKAN_MASTER', PMH, []);
stage('IMPOR_UNIT', UH.concat(['aktif']), [['LPP-011-U02', 'LPP-011', 'x', 'Unit Kerja', 'Unit Kediri', 'DHX', 'Jawa Timur', 'Kediri', '', 'OK', 'ditutup', 'FALSE']]);
m = c.terapkanImporAdmin();
T('IMPOR_UNIT kolom aktif FALSE → unit dinonaktifkan (bukan dihapus)', /1 dinonaktifkan/.test(m) && units().length === 5 && String(units().find(u => u.unitId === 'LPP-011-U02').aktif) === 'false', m);
stage('IMPOR_UNIT', UH.concat(['aktif']), [['LPP-011-U02', 'LPP-011', 'x', 'Unit Kerja', 'Unit Kediri', 'DHX', 'Jawa Timur', 'Kediri', '', 'OK', '', 'mungkin']]);
T('IMPOR_UNIT nilai aktif tidak jelas ditolak', /aktif harus TRUE atau FALSE/.test(c.cekImporAdmin()));
stage('IMPOR_UNIT', UH, []);

// ================= UNIT LIST & SKENARIO BER-UNIT =================
activate('budi@airnav.co.id', 'LPP-011'); activate('sari@garuda.co.id', 'AIR-GARUDA-INDONESIA');
const bt = login('budi@airnav.co.id'), st = login('sari@garuda.co.id'), adm = login('owner@dkp.go.id');
let r = env.post({ action: 'unitList' });
T('unitList tanpa login → AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED');
r = env.post({ action: 'unitList', sessionToken: bt });
T('unitList operator: hanya unit AKTIF miliknya (1 unit LPP-011; U02 dinonaktifkan)', r.ok && r.scope === 'own' && r.data.length === 1 && r.data.every(u => u.operatorId === 'LPP-011'), r);
T('unitList admin: semua 4 unit aktif', env.post({ action: 'unitList', sessionToken: adm }).data.length === 4);
const base = (extra) => Object.assign({ action: 'create', operatorId: 'LPP-011', jenisOperator: 'LPPNPI', namaOperator: 'AirNav Indonesia Cabang Surabaya', kategori: '01 - Uji', skenario: 'Skenario unit uji', ancamanNilai: 5, kerentananNilai: 5, konsekuensiNilai: 5, bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2027-04-01', namaPengisi: 'Budi', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'GM' }, extra);
let a1 = env.post(base({ sessionToken: bt }));
let a2 = env.post(base({ sessionToken: bt, unitId: 'LPP-011-U01' }));
let a3n = env.post(base({ sessionToken: bt, unitId: 'LPP-011-U02' }));
T('skenario ke unit NONAKTIF ditolak', !a3n.ok && a3n.code === 'UNIT_INVALID', a3n);
c.SpreadsheetApp.getActive(); { const us = env.sheets.MASTER_UNIT, h = us._data[0]; us._data.find(x => x[0] === 'LPP-011-U02')[h.indexOf('aktif')] = true; } env.cache.clear();
let a3 = env.post(base({ sessionToken: bt, unitId: 'LPP-011-U02' }));
T('skenario sama di induk dan 2 unit berbeda → BUKAN duplikat (3 tersimpan)', a1.ok && a2.ok && a3.ok, [a1, a2, a3]);
r = env.post(base({ sessionToken: bt, unitId: 'LPP-011-U01' }));
T('skenario sama di unit yang sama → DUPLICATE_RISK', !r.ok && r.code === 'DUPLICATE_RISK', r);
r = env.post(base({ sessionToken: bt, unitId: 'AIR-GARUDA-INDONESIA-SUB', skenario: 'lain' }));
T('unit milik operator lain → UNIT_INVALID', !r.ok && r.code === 'UNIT_INVALID', r);
r = env.post(base({ sessionToken: bt, unitId: 'LPP-011-U99', skenario: 'lain2' }));
T('unit tidak terdaftar → UNIT_INVALID', !r.ok && r.code === 'UNIT_INVALID', r);
const rowU = env.rows('RISK_ASSESSMENT').find(x => x.riskId === a2.id);
T('baris risiko menyimpan unitId; kunci assessment berakhiran |u:<unitId>', rowU.unitId === 'LPP-011-U01' && /\|u:LPP-011-U01$/.test(rowU.assessmentKey), rowU);
T('RISK_HISTORY ikut mencatat unitId', env.rows('RISK_HISTORY').some(h => h.riskId === a2.id && h.unitId === 'LPP-011-U01'));
r = env.post({ action: 'riskData', sessionToken: bt });
T('riskData memuat unitId + namaUnit', r.ok && r.data.some(x => x.unitId === 'LPP-011-U01' && x.namaUnit === 'Cabang Pembantu Banyuwangi') && r.data.some(x => x.riskId === a1.id && x.unitId === ''));
const det = env.post({ action: 'riskDetail', id: a2.id, sessionToken: bt }).data;
T('riskDetail memuat unitId + namaUnit', det.unitId === 'LPP-011-U01' && det.namaUnit === 'Cabang Pembantu Banyuwangi');
r = env.post(Object.assign({}, base({ action: 'update', id: a2.id, sessionToken: bt, unitId: 'LPP-011-U02', area: 'diubah', rowVersion: det.rowVersion })));
T('update tidak bisa memindahkan unit (unit tetap U01)', r.ok && env.rows('RISK_ASSESSMENT').find(x => x.riskId === a2.id).unitId === 'LPP-011-U01', r);
env.cache.clear();
const d1 = env.get({ action: 'dashboard' }).data;
const st1 = env.post({ action: 'operatorStatus', sessionToken: bt }).data.find(x => x.operatorId === 'LPP-011');
T('operatorStatus: jumlahUnit 2, unitTerisi 2', st1.jumlahUnit === 2 && st1.unitTerisi === 2, st1);
{ const all = env.post({ action: 'operatorStatus', sessionToken: adm }).data, rr = env.rows('RISK_ASSESSMENT'), want = id => rr.filter(x => x.operatorId === id).length;
  T('operatorStatus: jumlahSkenario setiap operator = jumlah baris risikonya (cek semua operator)', all.length > 300 && all.every(x => x.jumlahSkenario === want(x.operatorId)) && st1.jumlahSkenario === 3, all.filter(x => x.jumlahSkenario !== want(x.operatorId)).slice(0, 3));
  T('operatorStatus: status DPRK tetap benar setelah optimasi (14+1 Sudah Mengisi)', all.filter(x => x.statusDprk === 'Sudah Mengisi').length === 15, all.filter(x => x.statusDprk === 'Sudah Mengisi').length); }
r = env.post({ action: 'unitList', sessionToken: bt });
T('unitList: jumlahSkenario per unit', r.data.find(u => u.unitId === 'LPP-011-U01').jumlahSkenario === 1);

// ================= SIMPAN PER PAKET =================
const pack = (extra, rows) => Object.assign({ action: 'saveRiskBatch', operatorId: 'AIR-GARUDA-INDONESIA', jenisOperator: 'Airlines', namaOperator: 'x', bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2027-04-01', namaPengisi: 'Sari', jabatanPengisi: 'SM', batchId: 'BATCHUJI0001', rows }, extra);
const mk = (n, unit, s) => Array.from({ length: n }, (_, i) => ({ unitId: unit, kategori: String((i % 19) + 1).padStart(2, '0') + ' - Kat', skenario: (s || 'Skenario paket ') + (i + 1), ancamanNilai: 1 + (i % 10), kerentananNilai: 5, konsekuensiNilai: 9, perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'Station Manager' }));
const nRisk = () => env.rows('RISK_ASSESSMENT').length;
r = env.post(pack({}, mk(3, 'AIR-GARUDA-INDONESIA-SUB')));
T('paket tanpa login (login belum wajib) → AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED', r);
r = env.post(pack({ sessionToken: bt }, mk(3, 'AIR-GARUDA-INDONESIA-SUB')));
T('paket operator lain → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);
T('batchId tidak valid → ditolak', !env.post(pack({ sessionToken: st, batchId: 'x' }, mk(1, ''))).ok);
r = env.post(pack({ sessionToken: st, batchId: 'BATCHBESAR01' }, mk(301, '')));
T('lebih dari 300 baris → ditolak', !r.ok && /300/.test(r.error), r);
const bad = mk(5, 'AIR-GARUDA-INDONESIA-SUB'); bad[2].ancamanNilai = 11; bad[3].unitId = 'LPP-011-U01'; bad[4].kategori = '25 - x';
const n0 = nRisk();
r = env.post(pack({ sessionToken: st, batchId: 'BATCHSALAH01' }, bad));
T('ada baris salah → TIDAK ada yang disimpan; galat per nomor baris', !r.ok && nRisk() === n0 && r.errors.map(e => e.baris).join() === '3,4,5' && /bukan milik/.test(JSON.stringify(r.errors)), r);
const good = mk(19, 'AIR-GARUDA-INDONESIA-SUB').concat(mk(19, 'AIR-GARUDA-INDONESIA-DPS'), mk(2, ''));
r = env.post(pack({ sessionToken: st }, good));
const saved = env.rows('RISK_ASSESSMENT').filter(x => x.riskId.startsWith('RISK-B-BATCHUJI0001-'));
T('paket 40 baris (2 stasiun + induk) tersimpan sekaligus', r.ok && r.saved === 40 && saved.length === 40 && nRisk() === n0 + 40, r);
T('server menghitung ulang rating & ALARP (1+5+9=15 Menengah/ALARP; 10+5+9=24 Menengah-Tinggi)', saved.find(x => x.skenario === 'Skenario paket 1' && x.unitId === 'AIR-GARUDA-INDONESIA-SUB').kategoriPenerimaan === 'ALARP' && saved.find(x => x.skenario === 'Skenario paket 10' && x.unitId === 'AIR-GARUDA-INDONESIA-DPS').risikoRating === 'Menengah-Tinggi');
T('setiap baris punya unitId, editToken, assessmentKey, pemilikRisiko', saved.filter(x => x.unitId === 'AIR-GARUDA-INDONESIA-DPS').length === 19 && saved.filter(x => x.unitId === '').length === 2 && saved.every(x => x.editToken && x.assessmentKey && x.pemilikRisiko === 'Station Manager'));
T('DPRK induk dibuat sekali; RISK_HISTORY 40 baris; 1 entri audit BATCH_CREATE', env.rows('MASTER_DPRK').filter(d => d.operatorId === 'AIR-GARUDA-INDONESIA').length === 1 && env.rows('RISK_HISTORY').filter(h => h.riskId.startsWith('RISK-B-BATCHUJI0001-')).length === 40 && env.rows('AUDIT_LOG').filter(a => a.action === 'BATCH_CREATE' && a.entityId === 'BATCHUJI0001').length === 1);
r = env.post(pack({ sessionToken: st }, good));
T('paket yang sama dikirim ulang → tidak tersimpan ganda', r.ok && r.duplicate === true && nRisk() === n0 + 40, r);
const mix = mk(3, 'AIR-GARUDA-INDONESIA-SUB').concat(mk(2, 'AIR-GARUDA-INDONESIA-SUB', 'Baru '));
r = env.post(pack({ sessionToken: st, batchId: 'BATCHUJI0002' }, mix));
T('paket berisi skenario yang sudah ada → galat (tanpa lewatiDuplikat)', !r.ok && r.errors.length === 3 && /sudah ada/.test(r.errors[0].galat[0]), r);
r = env.post(pack({ sessionToken: st, batchId: 'BATCHUJI0003', lewatiDuplikat: true }, mix));
T('lewatiDuplikat → 3 dilewati, 2 baru tersimpan', r.ok && r.saved === 2 && r.skipped === 3, r);
const twin = mk(1, 'AIR-GARUDA-INDONESIA-SUB', 'Kembar ').concat(mk(1, 'AIR-GARUDA-INDONESIA-SUB', 'Kembar '));
r = env.post(pack({ sessionToken: st, batchId: 'BATCHUJI0004' }, twin));
T('dua baris kembar di paket yang sama → galat baris 2', !r.ok && r.errors[0].baris === 2 && /sama dengan baris 1/.test(r.errors[0].galat[0]), r);
r = env.post(pack({ sessionToken: adm, batchId: 'BATCHADMIN01' }, mk(2, 'AIR-GARUDA-INDONESIA-DPS', 'Admin ')));
T('admin boleh mengimpor untuk operator mana pun', r.ok && r.saved === 2, r);
r = env.post(pack({ sessionToken: st, batchId: 'BATCHBARU001', operatorId: 'AIR-PAUA-SATU', tanggalPengesahan: '' }, mk(1, '')));
T('operator tanpa DPRK & tanpa tanggal pengesahan → ditolak', !r.ok, r);
env.cache.clear();
const d2 = env.get({ action: 'dashboard' }).data;
T('dashboard menghitung skenario per unit terpisah (+44 risiko, bukan digabung)', d2.kpi.totalRisks === d1.kpi.totalRisks + 44, [d1.kpi.totalRisks, d2.kpi.totalRisks]);
const lock = (() => { const L = c.LockService.getScriptLock; c.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} }); const x = env.post(pack({ sessionToken: st, batchId: 'BATCHSIBUK01' }, mk(1, ''))); c.LockService.getScriptLock = L; return x; })();
T('paket saat server sibuk → BUSY (tidak setengah tersimpan)', lock.code === 'BUSY');
const big = mk(300, 'AIR-GARUDA-INDONESIA-SUB', 'Besar ');
const t0 = Date.now(); r = env.post(pack({ sessionToken: st, batchId: 'BATCHBESAR02' }, big));
T('paket 300 baris tersimpan', r.ok && r.saved === 300, r);
// cadangan gagal → impor dibatalkan
const env2 = newEnv({ now: Date.parse('2026-10-28T03:00:00Z'), failCreate: 'Drive penuh' }); seedAll(env2, { risks: false, incidents: false });
{ const s = env2.ctx.SpreadsheetApp.getActive().insertSheet('PERBAIKAN_MASTER'); s.appendRow(PMH); s.appendRow(['BD-277', 'Dekai', 'iata', 'DEK', 'DEX', 'uji']); }
const mf = env2.ctx.terapkanImporAdmin();
T('cadangan sebelum impor gagal → impor DIBATALKAN, master tidak berubah', /DIBATALKAN/.test(mf) && env2.rows('MASTER_OPERATOR').find(x => x.operatorId === 'BD-277').iata === 'DEK', mf);
const mh = env2.ctx.cekImporAdmin();
T('cekImporAdmin tidak membuat cadangan (hanya memeriksa)', /Pemeriksaan bersih/.test(mh) && Object.keys(env2.drive.files).length === 0);
T.done();
