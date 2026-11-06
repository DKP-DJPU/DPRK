// Uji parser impor matriks DPRK (assets/js/impor-matriks.js) dengan grid SINTETIS yang meniru format Lampiran II
// dan kebiasaan file nyata (ID jadi tanggal, ID angka 3.6, "1,0", tanggal kaji ulang campuran, Sharing, blok khusus).
const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'assets', 'js', 'impor-matriks.js'));
const K = require(path.join(__dirname, '..', '..', 'data', 'katalog-risiko.json'));
let ok = 0, fail = 0;
const T = (n, c, i) => { c ? ok++ : fail++; console.log((c ? 'LULUS ' : 'GAGAL ') + n + (c ? '' : '  → ' + String(JSON.stringify(i)).slice(0, 500))); };
const SK = Object.fromEntries(K.skenario.map(s => [s[0], s]));
const C = v => ({ v });
// kolom: A ID | B huruf | C skenario | D area | E langkah | F kerentanan saat ini | G-H ancaman | I-J kerentanan | K-L konsekuensi | M-N risiko | O tambahan | P pemilik | Q tanggal | R keterangan
const row = (id, huruf, sk, a, k, c, tgl, ket, extra = {}) => [id, huruf, sk, extra.area || 'PSCP', 'SOP rekaan', 'Kerentanan rekaan', a, extra.ra || '', k, '', c, '', extra.r !== undefined ? extra.r : (a != null ? a + k + c : null), extra.rr || '', 'Langkah rekaan', 'Pemilik rekaan', tgl, ket].map(C);
const head = [
  [C('MATRIKS DAFTAR RISIKO')],
  [C('OPERATOR PENERBANGAN'), C(null), C(null), C(': Bandar Udara Rekaan')],
  [C('BULAN'), C(null), C(null), C(': Juli 2026')],
  [],
  ['ID RISK', 'SKENARIO ANCAMAN', null, 'AREA KERENTANAN', 'LANGKAH KEAMANAN SAAT INI', 'KERENTANAN SAAT INI', 'ANCAMAN', null, 'KERENTANAN', null, 'KONSEKUENSI', null, 'RISIKO', null, 'LANGKAH-LANGKAH KEAMANAN TAMBAHAN', 'PEMILIK RESIKO (RISK OWNER)', 'TANGGAL KAJI ULANG RISIKO', 'KETERANGAN'].map(C),
  [],
  [null, null, null, null, null, null, 'NILAI', 'RATING', 'NILAI', 'RATING', 'NILAI', 'RATING', 'NILAI', 'RATING'].map(C),
];
const grid = head.concat([
  row('1,0', 'PERSON BORNE IEDs', null, null, null, null, null, null),
  row(1.01, 'a.', SK['01.01'][2], 4, 3, 8, '22 Juli 2026', 'Mitigasi', { rr: 'MENENGAH' }),
  row(new Date(Date.UTC(2026, 0, 10)), 'b.', SK['01.10'][2], 4, 3, 6, new Date(Date.UTC(2026, 11, 31)), 'Sharing'),
  row('b.', null, '…...', null, null, null, null, null),
  row('3. 0', 'UAS', null, null, null, null, null, null),
  row(3.6, 'a.', SK['03.06'][2], 6, 6, 10, '31/12/2026\n \n31 Maret 2027 (anggaran)', 'Mitigasi dan Sharing', { r: 21, rr: 'MENENGAH' }),
  row('4.0', 'LANDSIDE', null, null, null, null, null, null),
  row('4.2', 'a.', SK['04.09'][2], 4, 2, 8, 'segera', 'Diterima'),
  row('4.3', 'b.', 'Skenario rekaan dengan nilai di luar rentang', 11, 2, 2.5, '', ''),
  row('1.13', 'c.', 'Skenario tambahan operator yang belum ada di katalog nasional', 9, 9, 9, '1 Agt 2026', 'Mitigasi'),
  row('20.1', 'a.', 'Kategori tidak dikenal', 3, 3, 3, '', 'Mitigasi'),
  [C('HASIL PENILAIAN RISIKO KHUSUS')],
  row('2.0', 'IED IN CARGO', null, null, null, null, null, null),
  row('2.2', 'a.', SK['02.02'][2], 2, 1, 10, new Date(Date.UTC(2026, 8, 1)), 'Sharing'),
  [C('Mengetahui,')],
]);
const R = P.parseGrid(grid, K);
const L = n => R.rows.find(x => x.line === n);
T('tanpa galat fatal + meta operator/periode dari kepala file', !R.fatal && R.meta.operator === 'Bandar Udara Rekaan' && R.meta.bulan === 'Juli' && R.meta.tahun === '2026', [R.fatal, R.meta]);
T('baris judul kategori, baris contoh "…", teks penutup, dan blok Risiko Khusus dilewati', R.rows.length === 7 && R.dilewatiKhusus === 1, [R.rows.map(x => x.idFile), R.dilewatiKhusus]);
const r1 = L(9);
T('baris lengkap: kategori, ID, nilai, total & rating dihitung', r1.kategori.startsWith('01 - ') && r1.idRisikoKatalog === '01.01' && r1.total === 15 && r1.rating === 'Menengah' && r1.perlakuan === 'Mitigasi' && r1.tanggalKaji === '2026-07-22' && !r1.errors.length && !r1.warnings.length, r1);
const r2 = L(10);
T('ID "1.10" yang diubah Excel menjadi tanggal 10 Jan → 01.10; Sharing → Mitigasi; tanggal Excel; prioritas otomatis Biasa', r2.idRisikoKatalog === '01.10' && r2.perlakuan === 'Mitigasi' && r2.tanggalKaji === '2026-12-31' && r2.prioritas === 'Biasa' && r2.prioritasOtomatis, r2);
const r3 = L(13);
T('ID angka 3.6 → 03.06; nilai di file 21 ≠ hitung 22 → peringatan; rating file beda → peringatan', r3.idRisikoKatalog === '03.06' && r3.total === 22 && r3.warnings.some(w => /di file 21/.test(w)) && r3.warnings.some(w => /Rating di file MENENGAH/.test(w)), r3);
T('"Mitigasi dan Sharing" → Mitigasi tanpa catatan perlakuan; beberapa tanggal → paling awal + catatan; Menengah-Tinggi → Segera', r3.perlakuan === 'Mitigasi' && !/Perlakuan di matriks/.test(r3.keterangan) && r3.tanggalKaji === '2026-12-31' && /31 Maret 2027/.test(r3.keterangan) && r3.prioritas === 'Segera', r3);
const r4 = L(15);
T('nomor dulu: ID 4.2 ada di katalog → tetap 04.02 walau teksnya teks 04.09; tanggal "segera" tidak terbaca', r4.idRisikoKatalog === '04.02' && !r4.isiSendiri && r4.tanggalKaji === '' && r4.warnings.some(w => /tidak terbaca/.test(w)) && r4.perlakuan === 'Diterima', r4);
const r7 = L(17);
T('ID 1.13 tidak ada di katalog → Isi Sendiri (__MANUAL__), "ID operator: 01.13" di Keterangan; Tinggi → Sangat Segera', r7.isiSendiri && r7.idRisikoKatalog === '__MANUAL__' && /ID operator: 01\.13/.test(r7.keterangan) && r7.rating === 'Tinggi' && r7.prioritas === 'Sangat Segera', r7);
T('prioritas dari kolom file dipakai bila ada', P.prioritas('Sangat segera', 'Rendah').v === 'Sangat Segera' && !P.prioritas('Biasa', 'Tinggi').auto && P.prioritas('', 'Rendah').v === 'Biasa');
const r5 = L(16);
T('nilai 11 dan 2.5 → galat; perlakuan kosong → peringatan', r5.errors.length === 2 && r5.errors.some(e => /Ancaman harus bilangan bulat 1–10/.test(e)) && r5.errors.some(e => /Konsekuensi/.test(e)) && r5.warnings.some(w => /kosong/.test(w)), r5);
T('kategori 20 → galat', L(18).errors.some(e => /Kategori 20/.test(e)));
T('baris di blok Risiko Khusus tidak ikut', !R.rows.some(x => x.idRisikoKatalog === '02.02'));
T('tanpa judul kolom → pesan fatal yang jelas', /ID RISK/.test(P.parseGrid([[C('abc')]], K).fatal));
const lama = head.slice(0, 5).concat([row('1.01', 'a.', 'x', 'Tinggi', 'Tinggi', 'Tinggi', '', '')]);
T('format lama tanpa baris NILAI → pesan fatal', /NILAI/.test(P.parseGrid(lama, K).fatal || ''));
T('parseDates: "31/12/2026", "22 Juli 2026", "2027-03-31", "1 Agt 2026"', JSON.stringify(P.parseDates('31/12/2026 dan 22 Juli 2026; 2027-03-31; 1 Agt 2026').sort()) === JSON.stringify(['2026-07-22', '2026-08-01', '2026-12-31', '2027-03-31']), P.parseDates('31/12/2026 dan 22 Juli 2026; 2027-03-31; 1 Agt 2026'));
console.log(`\n[impor-matriks] ${ok} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
