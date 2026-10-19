// Uji band risiko & kategori penerimaan sesuai PR 16/41 DJPU 2024, hitung ulang data,
// dan penjagaan nol di depan (V3.32–V3.33).
const { fx, tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('risk-band');
const env = newEnv();
seedAll(env, { incidents: false });
const c = env.ctx, s = env.sheets.RISK_ASSESSMENT;
const RISKS = fx('risks');

const band = n => c.ratingTotal_(n);
T('band PR16/41: 7=Rendah, 8=M-Rendah, 13=M-Rendah, 14=Menengah, 19=Menengah, 20=M-Tinggi, 25=M-Tinggi, 26=Tinggi',
  band(3) == 'Rendah' && band(7) == 'Rendah' && band(8) == 'Menengah-Rendah' && band(13) == 'Menengah-Rendah' && band(14) == 'Menengah' && band(19) == 'Menengah' && band(20) == 'Menengah-Tinggi' && band(25) == 'Menengah-Tinggi' && band(26) == 'Tinggi' && band(30) == 'Tinggi');
T('ALARP: 25→Tidak dapat ditoleransi, 19→ALARP, 13→Dapat ditoleransi',
  c.computeRisk_({ ancamanNilai: 9, kerentananNilai: 8, konsekuensiNilai: 8 }).kategoriPenerimaan == 'Tidak dapat ditoleransi' && c.computeRisk_({ ancamanNilai: 7, kerentananNilai: 6, konsekuensiNilai: 6 }).kategoriPenerimaan == 'ALARP' && c.computeRisk_({ ancamanNilai: 5, kerentananNilai: 4, konsekuensiNilai: 4 }).kategoriPenerimaan == 'Dapat ditoleransi');
T('band komponen 1–10 tidak berubah', c.ratingComponent_(2) === 'Rendah' && c.ratingComponent_(3) === 'Menengah-Rendah' && c.ratingComponent_(10) === 'Tinggi');

// Pratinjau tidak menulis apa pun
const before = JSON.stringify(s._data);
const pre = c.cekHitungUlangRisiko();
T('pratinjau tidak menulis apa pun', JSON.stringify(s._data) === before && env.rows('RISK_HISTORY').length === 0, pre.split('\n')[0]);
T('pratinjau melaporkan semua baris (ALARP kosong)', new RegExp('— ' + RISKS.length + ' baris berubah').test(pre), pre.split('\n')[0]);

// Terapkan
c.terapkanHitungUlangRisiko();
const rows = env.rows('RISK_ASSESSMENT');
const bad = rows.filter(r => c.ratingTotal_(Number(r.risikoNilai)) !== r.risikoRating || Number(r.risikoNilai) !== Number(r.ancamanNilai) + Number(r.kerentananNilai) + Number(r.konsekuensiNilai) || c.PENERIMAAN[r.risikoRating] !== r.kategoriPenerimaan);
T('setelah diterapkan: semua skenario konsisten (nilai = jumlah komponen, rating & ALARP sesuai PR16)', bad.length === 0 && rows.length === RISKS.length, bad.slice(0, 2));
const an = rows.find(r => r.riskId === 'RISK-ANOM-NILAI');
T('anomali nilai (3+1+2 tercatat 14) → 6, Rendah', Number(an.risikoNilai) === 6 && an.risikoRating === 'Rendah', an.risikoNilai);
const ak = rows.find(r => r.riskId === 'RISK-ANOM-KAT');
T('anomali kategori 1 → "01" tersimpan sebagai TEKS (nol di depan terjaga, V3.33)', ak.kategori === '01', ak.kategori);
T('RISK_HISTORY mencatat tiap perubahan & rowVersion naik', env.rows('RISK_HISTORY').length === RISKS.length && env.rows('RISK_HISTORY').every(x => x.perubahan === 'Hitung ulang PR16/41') && Number(ak.rowVersion) === 2);
T('AUDIT_LOG: 1 ringkasan RECOMPUTE', env.rows('AUDIT_LOG').filter(a => a.action === 'RECOMPUTE').length === 1);
const keep = ['skenario', 'langkahSaatIni', 'kerentananSaatIni', 'keterangan', 'createdAt', 'editToken', 'namaOperator', 'pemilikRisiko'];
const touched = RISKS.filter(o => { const n = rows.find(r => r.riskId === o.riskId); return keep.some(k => String(n[k]) !== String(o[k])); });
T('kolom teks lain (skenario, "- langkah…", createdAt, token…) tidak berubah', touched.length === 0, touched.slice(0, 1));
T('jalankan lagi → 0 baris berubah (idempoten)', /— 0 baris berubah/.test(c.terapkanHitungUlangRisiko()));

// Simpan & ubah lewat API: rating & ALARP kiriman browser diabaikan
c.setupLogin();
const base = { action: 'create', operatorId: 'BD-100', jenisOperator: 'Bandar Udara', namaOperator: 'Juanda', kategori: '01 - X', bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2026-12-01', namaPengisi: 'U', kategoriPenerimaan: 'PALSU', risikoRating: 'Rendah', risikoNilai: 3, dprkEditToken: 'TOKDPRKBD100' };
const mk = (a, k, k2, sk) => env.post(Object.assign({}, base, { ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: k2, skenario: sk, requestId: 'R' + sk }));
const r25 = mk(9, 8, 8, 's25'), r26 = mk(9, 9, 8, 's26'), r7 = mk(3, 2, 2, 's7');
const g = id => env.rows('RISK_ASSESSMENT').find(r => r.riskId === id);
T('simpan nilai 25 → Menengah-Tinggi + Tidak dapat ditoleransi', r25.ok && g(r25.id).risikoRating === 'Menengah-Tinggi' && g(r25.id).kategoriPenerimaan === 'Tidak dapat ditoleransi', r25);
T('simpan nilai 26 → Tinggi; nilai 7 → Rendah/Dapat ditoleransi', g(r26.id).risikoRating === 'Tinggi' && g(r7.id).risikoRating === 'Rendah' && g(r7.id).kategoriPenerimaan === 'Dapat ditoleransi');
const up = env.post(Object.assign({}, base, { action: 'update', id: r7.id, editToken: r7.editToken, ancamanNilai: 7, kerentananNilai: 6, konsekuensiNilai: 6, skenario: 's7b' }));
T('update → nilai 19 Menengah + ALARP', up.ok && g(r7.id).risikoRating === 'Menengah' && g(r7.id).kategoriPenerimaan === 'ALARP', up);

// Nol di depan pada kolom lain
env.post({ action: 'authRegister', nama: 'Tes HP', email: 'hp@x.co.id', jabatan: 'x', operatorId: 'BD-100', noHp: '081234567890' });
T('No. HP "0812…" tetap diawali 0 (V3.33)', env.rows('USER_ACCESS').find(x => x.email === 'hp@x.co.id').noHp === '081234567890');
T('sanitizeCell_: formula & nol di depan diberi apostrof', c.sanitizeCell_('=SUM(A1)') === "'=SUM(A1)" && c.sanitizeCell_('0812') === "'0812" && c.sanitizeCell_('0.5') === '0.5' && c.sanitizeCell_(12) === 12);
T.done();
