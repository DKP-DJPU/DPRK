// Membuat data uji SINTETIS (rekaan) untuk tests/.
// JANGAN pernah menyalin data asli RISK_ASSESSMENT / LAPORAN_INSIDEN ke repo publik:
// DPRK berklasifikasi Terbatas dan laporan berisi data pribadi pelapor.
//
// operators.json = daftar identitas operator aktif (informasi publik, sama dengan GET action=operators).
// risks.json / dprk.json / incidents.json = rekaan, deterministik (PRNG dengan seed tetap).
//
// Jalankan ulang:  node tests/fixtures/make-fixtures.js <path-ke-daftar-operator.json>
const fs = require('fs'), path = require('path');
const OUT = __dirname;

let seed = 20261020;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const BAND = [[3, 7, 'Rendah'], [8, 13, 'Menengah-Rendah'], [14, 19, 'Menengah'], [20, 25, 'Menengah-Tinggi'], [26, 30, 'Tinggi']];
const band = n => (BAND.find(b => n >= b[0] && n <= b[1]) || [0, 0, ''])[2];
const KAT = JSON.parse(fs.readFileSync(path.join(OUT, '..', '..', 'data', 'katalog-risiko.json'), 'utf8')).kategori;
const katLabel = k => k + ' - ' + (KAT.find(x => x[0] === k) || [k, 'Kategori'])[1];

// --- operator (publik)
let ops;
if (process.argv[2]) {
  ops = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  ops = ops.operators || ops;
  ops = ops.map(o => ({ operatorId: o.operatorId, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, kodeOperator: o.kodeOperator || '', iata: o.iata || '', provinsi: o.provinsi || '', kabkota: o.kabkota || '', lokasi: o.lokasi || '', kelas: o.kelas || '', status: o.status || 'Aktif', aktif: o.aktif === undefined ? true : o.aktif }));
  fs.writeFileSync(path.join(OUT, 'operators.json'), JSON.stringify(ops, null, 0));
} else ops = JSON.parse(fs.readFileSync(path.join(OUT, 'operators.json'), 'utf8'));
const byId = Object.fromEntries(ops.map(o => [o.operatorId, o]));

// --- operator yang "sudah mengisi" (13 bandara + 1 maskapai), meniru kondisi pilot
const FILLED = ['BD-007', 'BD-100', 'BD-009', 'BD-054', 'BD-068', 'BD-081', 'BD-087', 'BD-157', 'BD-199', 'BD-228', 'BD-229', 'BD-235', 'BD-238', 'AIR-THAI-AIRASIA'];
const COUNT = { 'BD-007': 14, 'BD-100': 13, 'AIR-THAI-AIRASIA': 1 };
const risks = [], dprk = [];
let n = 0;
FILLED.forEach(oid => {
  const o = byId[oid];
  if (!o) throw new Error('Operator ' + oid + ' tidak ada di operators.json');
  const air = o.jenisOperator === 'Airlines';
  dprk.push({ dprkId: 'DPRK-' + oid, operatorId: oid, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, periode: air ? 'Juni' : 'Juli', tahun: 2026, versi: 1, tanggalPenyusunan: '2026-07-15', tanggalPengesahan: '2026-07-01', tanggalKajiUlang: oid === 'BD-100' ? '2026-11-01' : '', linkFileDprk: '', status: 'Aktif', namaPengisi: 'Pengisi Uji', jabatanPengisi: 'Uji', riskOwner: 'Uji', emailRiskOwner: '', createdAt: '2026-09-15T02:02:39.000Z', updatedAt: '2026-09-15T02:02:39.000Z', dprkEditToken: 'TOKDPRK' + oid.replace(/[^A-Z0-9]/g, ''), tanggalWajibPembaruan: '' });
  const cnt = COUNT[oid] || 11;
  const kats = KAT.map(k => k[0]).sort(() => rnd() - 0.5).slice(0, cnt);
  kats.forEach((k, i) => {
    n++;
    let a = int(2, 9), v = int(1, 8), c = int(2, 9);
    if (oid === 'BD-007' && i === 0) { a = 9; v = 8; c = 8; } // 25 → Menengah-Tinggi (batas band)
    const total = a + v + c;
    risks.push({ riskId: 'RISK-UJI-' + String(n).padStart(4, '0'), dprkId: 'DPRK-' + oid, operatorId: oid, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, kategori: katLabel(k), idRisikoKatalog: '', skenario: 'Skenario uji ' + n, area: pick(['PSCP', 'HBS', 'Apron', 'Landside', 'Kargo']), langkahSaatIni: '- langkah uji', kerentananSaatIni: 'uji', ancamanNilai: a, ancamanRating: '', kerentananNilai: v, kerentananRating: '', konsekuensiNilai: c, konsekuensiRating: '', risikoNilai: total, risikoRating: band(total), kategoriPenerimaan: '', perlakuan: 'Mitigasi', prioritas: 'Segera', langkahTambahan: '', pemilikRisiko: 'Uji', tanggalKaji: '', keterangan: '', bulan: air ? 'Juni' : 'Juli', tahun: 2026, namaPengisi: 'Pengisi Uji', jabatanPengisi: 'Uji', createdAt: '9/15/2026 9:02:39', updatedAt: '9/15/2026 9:02:39', editToken: 'TOKRISK' + n, assessmentKey: '', rowVersion: '' });
  });
});
// Anomali yang pernah ditemukan di data asli (untuk menguji hitung ulang):
const anomNilai = risks.find(r => r.operatorId === 'BD-081');
Object.assign(anomNilai, { riskId: 'RISK-ANOM-NILAI', ancamanNilai: 3, kerentananNilai: 1, konsekuensiNilai: 2, risikoNilai: 14, risikoRating: 'Rendah' });
const anomKat = risks.find(r => r.operatorId === 'AIR-THAI-AIRASIA');
Object.assign(anomKat, { riskId: 'RISK-ANOM-KAT', kategori: 1 });
// Satu skenario ganda (assessmentKey sama) — dashboard menghitungnya sekali.
const dup = Object.assign({}, risks.find(r => r.operatorId === 'BD-235'), { riskId: 'RISK-ANOM-GANDA', editToken: 'TOKGANDA', createdAt: '9/14/2026 9:00:00' });
risks.push(dup);

// --- laporan kejadian rekaan (status Baru; data pelapor palsu)
const JENIS = ['Ancaman keamanan (unlawful interference)', 'Gangguan operasional bandara/maskapai', 'Kecelakaan penerbangan', 'Pelanggaran prosedur keamanan (security breach)', 'Lainnya'];
const LING = { 'Ancaman keamanan (unlawful interference)': 'AVSEC', 'Pelanggaran prosedur keamanan (security breach)': 'AVSEC', 'Gangguan operasional bandara/maskapai': 'Non-AVSEC', 'Kecelakaan penerbangan': 'Non-AVSEC', Lainnya: 'Perlu Klasifikasi' };
const LOK = ['BD-072', 'BD-072', 'BD-072', 'BD-176', 'BD-222', 'BD-100', 'BD-007', 'BD-128', 'BD-212', 'BD-189', 'BD-170', 'BD-211', 'BD-062', 'BD-205', 'BD-237'];
const incidents = LOK.map((lid, i) => {
  const j = JENIS[i % JENIS.length], d = new Date(Date.UTC(2025, 5 + i, 3 + i)), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { id: 'INC-UJI-' + (i + 1), refNumber: 'LKP/' + String(i + 2).padStart(4, '0') + '/' + mm + '/' + d.getUTCFullYear(), createdAt: d.toISOString(), updatedAt: d.toISOString(), statusVerifikasi: 'Baru', lingkup: LING[j], judul: 'Kejadian uji ' + (i + 1) + ' di ' + byId[lid].namaOperator, jenis: j, kategoriAncaman: '', ringkasan: 'Ringkasan rekaan untuk pengujian.', tanggal: d.toISOString().slice(0, 10), jam: '', lokasiOperatorId: lid, lokasiBandara: byId[lid].namaOperator, lokasiDetail: '', provinsi: byId[lid].provinsi, otoritasWilayah: '', pihakTerlibatIds: '', pihakTerlibat: '', otoritasPenangan: '', terdampak: '', penyebab: '', kronologi: '', severity: pick(['Rendah', 'Sedang', 'Tinggi']), sumber: 'Berita media massa', namaMedia: '', linkMedia: '', namaPelapor: 'Pelapor Uji ' + (i + 1), instansi: 'Instansi Uji', hp: '0812000000' + String(i).padStart(2, '0'), email: 'pelapor' + (i + 1) + '@contoh.test', catatan: '', verifiedBy: '', verifiedAt: '' };
});

fs.writeFileSync(path.join(OUT, 'risks.json'), JSON.stringify(risks, null, 0));
fs.writeFileSync(path.join(OUT, 'dprk.json'), JSON.stringify(dprk, null, 0));
fs.writeFileSync(path.join(OUT, 'incidents.json'), JSON.stringify(incidents, null, 0));
console.log('operators', ops.length, '| risks', risks.length, '| dprk', dprk.length, '| incidents', incidents.length);
