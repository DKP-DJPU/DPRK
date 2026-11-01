// V3.42 — Usulan Lokasi oleh operator. Data REKAAN (nama operator dari daftar publik, akun & alamat fiktif).
// Alur: operator login → usulLokasi (provinsi + kab/kota wajib dari daftar resmi, alamat opsional) → master TIDAK
// berubah → Admin isi Status → cekUsulanLokasi → terapkanUsulanLokasi (cadangan + audit) → alasan tolak tampil.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('usulan-lokasi');
const logs = [];
const env = newEnv({ logs, now: Date.parse('2026-11-05T03:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.setupLogin();
const SAJ = 'AIR-SUPER-AIR-JET', ASI = 'AIR-ASI-PUDJIASTUTI-AVIATION', CIT = 'AIR-CITILINK-INDONESIA';
env.seed('MASTER_UNIT', 'H.UNIT', [
  { unitId: SAJ + '-CGK', operatorId: SAJ, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK – Soekarno-Hatta', kodeUnit: 'CGK', provinsi: 'DKI Jakarta', kabkota: 'Cengkareng (Jakarta)', aktif: true },
  { unitId: CIT + '-CGK', operatorId: CIT, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK – Soekarno-Hatta', kodeUnit: 'CGK', provinsi: 'DKI Jakarta', kabkota: 'Cengkareng (Jakarta)', aktif: true },
  { unitId: CIT + '-DPS', operatorId: CIT, jenisUnit: 'Stasiun', namaUnit: 'Stasiun DPS – I Gusti Ngurah Rai', kodeUnit: 'DPS', provinsi: 'Bali', kabkota: 'Kab. Badung', aktif: true }]);
const op = id => env.rows('MASTER_OPERATOR').find(o => o.operatorId === id);
const unit = id => env.rows('MASTER_UNIT').find(u => u.unitId === id);
const usul = () => env.rows('USULAN_LOKASI');
const login = email => { env.cache.clear(); env.post({ action: 'authRequestCode', email }); return env.post({ action: 'authVerify', email, code: env.lastCode(email) }).data.token; };
const daftar = (email, oid) => {
  env.post({ action: 'authRegister', nama: 'Uji', email, jabatan: 'Petugas', operatorId: oid });
  const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === email)[h.indexOf('status')] = 'Aktif';
  return login(email);
};
const setStatus = (id, status, alasan) => { const s = env.sheets.USULAN_LOKASI, h = s._data[0], r = s._data.find(x => x[h.indexOf('usulanId')] === id); r[h.indexOf('status')] = status; if (alasan !== undefined) r[h.indexOf('alasan')] = alasan; };

const tA = daftar('a@asi-rekaan.id', ASI), tS = daftar('sm.cgk@saj-rekaan.id', SAJ), tS2 = daftar('sm2@saj-rekaan.id', SAJ);
const asiBefore = JSON.stringify(op(ASI));

// --- operator: validasi
let r = env.post({ action: 'usulLokasi', operatorId: ASI, kodeWilayah: '32.01' });
T('tanpa login → ditolak', !r.ok && r.code === 'AUTH_REQUIRED', r);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: SAJ, kodeWilayah: '36.71' });
T('akun ASI mengusulkan untuk Super Air Jet → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '99.99' });
T('kode wilayah di luar daftar resmi → ditolak', !r.ok && /daftar resmi/.test(r.error), r);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '' });
T('provinsi/kab-kota kosong → ditolak (wajib)', !r.ok, r);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, unitId: CIT + '-DPS', kodeWilayah: '51.03' });
T('unit milik operator lain → ditolak', !r.ok && /bukan milik/.test(r.error), r);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '32.06', alamat: 'x'.repeat(301) });
T('alamat > 300 karakter → ditolak', !r.ok && /300/.test(r.error), r);

// --- operator: isi baru tanpa alamat (alamat opsional)
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '32.06' });
T('isi baru tanpa alamat → diterima sebagai usulan', r.ok && r.data.status === 'Menunggu' && r.data.jenis === 'Isi baru' && r.data.kabkota === 'Kab. Tasikmalaya' && r.data.provinsi === 'Jawa Barat', r);
const idA = r.data.usulanId;
T('MASTER_OPERATOR tidak berubah sebelum Admin menyetujui', JSON.stringify(op(ASI)) === asiBefore);
r = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '32.78', alamat: 'Jl. Rekaan No. 1' });
T('kirim ulang oleh akun yang sama → memperbarui usulan yang sama (bukan baris baru)', r.ok && r.diperbarui && r.data.usulanId === idA && usul().length === 1 && usul()[0].kabkota === 'Kota Tasikmalaya', usul());
r = env.post({ action: 'usulanLokasi', sessionToken: tA, operatorId: ASI });
T('baca usulan: milikSaya, status Menunggu, alamat ikut', r.ok && r.data.length === 1 && r.data[0].milikSaya && r.data[0].status === 'Menunggu' && r.data[0].alamat === 'Jl. Rekaan No. 1', r);
r = env.post({ action: 'usulanLokasi', sessionToken: tS, operatorId: ASI });
T('akun operator lain tidak melihat usulan ASI', r.ok && r.data.length === 0, r);

// --- operator: koreksi stasiun CGK (dua akun SAJ berbeda pendapat)
r = env.post({ action: 'usulLokasi', sessionToken: tS, operatorId: SAJ, unitId: SAJ + '-CGK', kodeWilayah: '36.71', catatan: 'Bandara berada di Kota Tangerang' });
T('koreksi stasiun CGK → jenis Koreksi, kode lokasi CGK, tercatat sekarang ikut disimpan', r.ok && r.data.jenis === 'Koreksi' && usul().find(x => x.usulanId === r.data.usulanId).kodeLokasi === 'CGK' && r.data.kabkotaSekarang === 'Cengkareng (Jakarta)', r);
const idS = r.data.usulanId;
r = env.post({ action: 'usulLokasi', sessionToken: tS2, operatorId: SAJ, unitId: SAJ + '-CGK', kodeWilayah: '36.03' });
const idS2 = r.data.usulanId;
T('akun kedua mengusulkan wilayah lain → baris terpisah', r.ok && idS2 !== idS && usul().length === 3);
r = env.post({ action: 'usulLokasi', sessionToken: tS, operatorId: SAJ, unitId: SAJ + '-CGK', kodeWilayah: '36.71' });
T('usulan sama dengan yang tercatat? (belum — tercatat masih Cengkareng) → tetap boleh', r.ok);

// --- batal
let tmp = env.post({ action: 'usulLokasi', sessionToken: tA, operatorId: ASI, kodeWilayah: '32.78' });
r = env.post({ action: 'batalUsulLokasi', sessionToken: tS, operatorId: SAJ, usulanId: idA });
T('batalkan usulan operator lain (operatorId tidak cocok) → tidak ditemukan', !r.ok && r.code === 'NOT_FOUND', r);

// --- Admin: cek
let m = c.cekUsulanLokasi();
T('cek: ringkasan + peringatan bertentangan (Kota Tangerang / Kab. Tangerang)', /3 usulan belum diputuskan/.test(m) && /Bertentangan/.test(m) && /Kota Tangerang \/ Kab\. Tangerang|Kab\. Tangerang \/ Kota Tangerang/.test(m) && /Pemeriksaan bersih/.test(m), m);
T('cek: peringatan bandara CGK tercatat lain', /Bandara CGK tercatat Cengkareng \(Jakarta\), DKI Jakarta/.test(m), m);
T('cek hanya menulis kolom peringatan; master tetap', usul().find(x => x.usulanId === idS).peringatan.indexOf('Bertentangan') === 0 && JSON.stringify(op(ASI)) === asiBefore);
m = c.terapkanUsulanLokasi();
T('terapkan tanpa keputusan → tidak ada yang diterapkan, tanpa cadangan', /Tidak ada keputusan/.test(m) && !/Cadangan/.test(m), m);

setStatus(idS, 'Diterima'); setStatus(idS2, 'Diterima');
m = c.cekUsulanLokasi();
T('dua wilayah berbeda sama-sama Diterima → MASALAH, tidak diterapkan', /MASALAH/.test(m) && /terima satu saja/.test(m), m);
setStatus(idS2, 'Ditolak', '');
m = c.cekUsulanLokasi();
T('Ditolak tanpa Alasan → MASALAH', /wajib diisi Alasan/.test(m), m);
setStatus(idS2, 'Ditolak', 'Bandara Soekarno-Hatta berada di Kota Tangerang');
setStatus(idA, 'Diterima');
m = c.cekUsulanLokasi();
T('cek bersih: pratinjau stasiun CGK mengubah stasiun SAJ + Citilink CGK + bandara CGK', /Pemeriksaan bersih/.test(m) && /mengubah 3 entitas/.test(m) && /Bandara CGK/.test(m), m);
const before = JSON.stringify(env.rows('MASTER_UNIT'));
T('cek tidak mengubah MASTER_UNIT', JSON.stringify(env.rows('MASTER_UNIT')) === before);

// Lokasi tercatat berubah setelah usulan dibuat → harus ditinjau ulang
const opS = env.sheets.MASTER_OPERATOR, oh = opS._data[0], asiRow = opS._data.find(x => x[oh.indexOf('operatorId')] === ASI);
asiRow[oh.indexOf('kabkota')] = 'Kab. Garut'; asiRow[oh.indexOf('provinsi')] = 'Jawa Barat';
m = c.cekUsulanLokasi();
T('lokasi master berubah sejak diusulkan → MASALAH', /sudah berubah sejak diusulkan/.test(m), m);
asiRow[oh.indexOf('kabkota')] = ''; asiRow[oh.indexOf('provinsi')] = '';

// --- Admin: terapkan
const audit0 = env.rows('AUDIT_LOG').length;
m = c.terapkanUsulanLokasi();
T('terapkan: cadangan dulu, lalu diterapkan', /Cadangan sebelum menerapkan: Backup/.test(m) && /2 usulan Diterima/.test(m) && /1 Ditolak/.test(m) && /SELESAI/.test(m), m);
T('ASI: provinsi, kab/kota, kodeWilayah diperbarui', op(ASI).provinsi === 'Jawa Barat' && op(ASI).kabkota === 'Kota Tasikmalaya' && op(ASI).kodeWilayah === '32.78', op(ASI));
T('stasiun CGK SAJ & Citilink → Kota Tangerang, Banten (36.71)', [SAJ + '-CGK', CIT + '-CGK'].every(id => unit(id).kabkota === 'Kota Tangerang' && unit(id).provinsi === 'Banten' && unit(id).kodeWilayah === '36.71'), [unit(SAJ + '-CGK'), unit(CIT + '-CGK')]);
T('bandara CGK (BD-222) ikut diperbarui; stasiun DPS tidak tersentuh', op('BD-222').kabkota === 'Kota Tangerang' && op('BD-222').provinsi === 'Banten' && unit(CIT + '-DPS').kabkota === 'Kab. Badung');
T('AUDIT_LOG: perubahan master + keputusan tercatat', env.rows('AUDIT_LOG').length - audit0 >= 6 && env.rows('AUDIT_LOG').some(a => a.entityType === 'USULAN_LOKASI' && a.action === 'REJECT'));
r = env.post({ action: 'usulanLokasi', sessionToken: tS2, operatorId: SAJ });
const rej = r.data.find(x => x.usulanId === idS2);
T('formulir: usulan ditolak tampil dengan alasan (bukan email)', rej && rej.status === 'Ditolak' && /Kota Tangerang/.test(rej.alasan) && rej.milikSaya, r);
T('formulir: usulan diterima berstatus Diterima', r.data.find(x => x.usulanId === idS).status === 'Diterima');
r = env.post({ action: 'batalUsulLokasi', sessionToken: tS, operatorId: SAJ, usulanId: idS });
T('usulan yang sudah diputuskan tidak bisa dibatalkan', !r.ok && /sudah diproses/.test(r.error), r);
r = env.post({ action: 'usulLokasi', sessionToken: tS, operatorId: SAJ, unitId: SAJ + '-CGK', kodeWilayah: '36.71' });
T('usul wilayah yang sudah tercatat → ditolak "sama dengan yang sudah tercatat"', !r.ok && /sama dengan yang sudah tercatat/.test(r.error), r);
m = c.terapkanUsulanLokasi();
T('terapkan ulang → idempoten (tidak ada keputusan baru)', /Tidak ada keputusan/.test(m), m);

// --- batal oleh pengusul
r = env.post({ action: 'usulLokasi', sessionToken: tS, operatorId: SAJ, kodeWilayah: '36.03' });
const idInduk = r.data.usulanId;
r = env.post({ action: 'batalUsulLokasi', sessionToken: tS, operatorId: SAJ, usulanId: idInduk });
T('batalkan usulan menunggu → Dibatalkan, tidak tampil lagi', r.ok && usul().find(x => x.usulanId === idInduk).status === 'Dibatalkan' && !env.post({ action: 'usulanLokasi', sessionToken: tS, operatorId: SAJ }).data.some(x => x.usulanId === idInduk), r);

// --- Monitoring Operator
const at = login('owner@dkp.go.id');
env.post({ action: 'usulLokasi', sessionToken: at, operatorId: 'AIR-BATIK-AIR-INDONESIA', kodeWilayah: '31.71' });
c.invalidateDashboardCache_();
r = env.post({ action: 'operatorStatus', sessionToken: at });
const mo = id => r.data.find(x => x.operatorId === id);
T('operatorStatus: lokasiLengkap & usulanLokasi', mo(ASI).lokasiLengkap === true && mo('AIR-BATIK-AIR-INDONESIA').lokasiLengkap === false && mo('AIR-BATIK-AIR-INDONESIA').usulanLokasi === 1 && mo(SAJ).usulanLokasi === 0, [mo(ASI), mo('AIR-BATIK-AIR-INDONESIA')]);
T('publik (GET operators) membawa kodeWilayah', env.get({ action: 'operators' }).data.find(x => x.operatorId === ASI).kodeWilayah === '32.78');
T('kode wilayah yang tersimpan sebagai angka (32.1) tetap dikenali sebagai 32.10', c.wilayah_(32.1) && c.wilayah_(32.1).kode === '32.10' && c.kodeWil_(36.7) === '36.70');
{ const sh = env.sheets.MASTER_OPERATOR, hh = sh._data[0]; sh._data.splice(3, 0, hh.map(() => ''));
  const f = c.findBy_(sh, 'operatorId', 'BD-222');
  T('findBy_: baris kosong di tengah sheet tidak menggeser nomor baris', f && sh._data[f.row - 1][hh.indexOf('operatorId')] === 'BD-222', f && f.row); }
T('tidak ada galat tercatat', !logs.some(l => /error/i.test(l)), logs.filter(l => /error/i.test(l)));
T.done();
