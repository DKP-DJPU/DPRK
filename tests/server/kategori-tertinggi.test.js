// V3.45 — nilai kategori ancaman per operator = skenario dengan nilai risiko TERTINGGI (keputusan Alex 10 Nov 2026).
// Nasional / per jenis = rata-rata nilai tertinggi tiap operator; donat distribusi tetap per skenario. Data SINTETIS.
const { tester, newEnv, fx } = require('./_lib.js');
const T = tester('kategori-tertinggi');
const env = newEnv({ now: Date.parse('2026-11-10T03:00:00Z') }), c = env.ctx;
env.seed('MASTER_OPERATOR', 'H.OP', fx('operators'));
const K1 = '01 - Person Borne IEDs', K3 = '03 - UAS';
const R = (id, op, jenis, kat, a, k, q, unitId) => ({ riskId: id, dprkId: 'DPRK-' + op, operatorId: op, jenisOperator: jenis, namaOperator: op, unitId: unitId || '', kategori: kat, skenario: 'Skenario rekaan ' + id, ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: q, risikoNilai: a + k + q, risikoRating: c.ratingTotal_(a + k + q), bulan: 'Oktober', tahun: 2026, updatedAt: '2026-10-01T00:00:00Z', rowVersion: 1 });
const rows = [
  // Operator A (bandara): kategori 01 = 15, 22, 13 → 22; kategori 03 = 9 → 9
  R('A1', 'BD-100', 'Bandar Udara', K1, 5, 5, 5), R('A2', 'BD-100', 'Bandar Udara', K1, 6, 6, 10), R('A3', 'BD-100', 'Bandar Udara', K1, 3, 3, 7), R('A4', 'BD-100', 'Bandar Udara', K3, 3, 3, 3),
  // Operator B (bandara): kategori 01 = 10; stasiun/unit 27 → nilai tertinggi seluruh lokasi = 27 (Tinggi)
  R('B1', 'BD-007', 'Bandar Udara', K1, 3, 3, 4), R('B2', 'BD-007', 'Bandar Udara', K1, 9, 9, 9, 'BD-007-U01'),
  // Operator C (bandara): kategori 01 = 12; kategori 03 = 11
  R('C1', 'BD-009', 'Bandar Udara', K1, 4, 4, 4), R('C2', 'BD-009', 'Bandar Udara', K3, 4, 4, 3),
];
env.seed('RISK_ASSESSMENT', 'H.RISK', rows);
env.seed('MASTER_DPRK', 'H.DPRK', ['BD-100', 'BD-007', 'BD-009'].map(o => ({ dprkId: 'DPRK-' + o, operatorId: o, jenisOperator: 'Bandar Udara', namaOperator: o, status: 'Aktif', tahun: 2026 })));
const kt = c.kategoriTertinggi_(env.rows('RISK_ASSESSMENT'));
T('per operator diambil skenario tertinggi: kategori 01 = rata-rata (22, 27, 12) = 20.33, 3 operator, 1 bernilai Tinggi', kt['01'].avg === 20.33 && kt['01'].n === 3 && kt['01'].tinggi === 1, kt['01']);
T('kategori 03 = rata-rata (9, 11) = 10, 2 operator', kt['03'].avg === 10 && kt['03'].n === 2, kt['03']);
const d = env.get({ action: 'dashboard' }).data, cat = k => d.categories.find(x => x.kode === k);
T('dashboard nasional: kategori 01 = 20.33 (bukan rata-rata semua skenario 16.5), n = 3 operator; jumlah operator bernilai Tinggi tidak dikirim ke publik', cat('01').avg === 20.33 && cat('01').n === 3 && !('tinggi' in cat('01')), cat('01'));
T('per jenis Bandar Udara memakai aturan yang sama', d.analytics['Bandar Udara'].categories.find(x => x.kode === '01').avg === 20.33, d.analytics['Bandar Udara'].categories);
T('donat distribusi tetap menghitung SEMUA skenario (8)', Object.values(d.riskDistribution).reduce((a, b) => a + b, 0) === 8, d.riskDistribution);
T('kategori dengan < MIN_GROUP operator tetap disembunyikan', cat('05').avg === 0 && !cat('05').suppressed);
T.done();
