// V3.38 — penilaian terakhir PER OPERATOR & UNIT. Mereproduksi simulasi 28 Okt 2026 (data REKAAN):
// LPP-004 (AirNav Cabang Yogyakarta) + 3 unit. Oktober 2026: Induk 4, Solo 3, Cilacap 2 skenario.
// Januari 2027: hanya Solo mengkaji ulang 3 skenarionya (nilai turun). Sebelum V3.38 Dashboard menghitung
// nilai lama Solo juga (hitung ganda), sedangkan rekap operator hanya memuat periode Januari (Induk & Cilacap hilang).
const { tester, newEnv, seedAll } = require('./_lib.js');
const KAT = Object.fromEntries(require('../../data/katalog-risiko.json').kategori);
const T = tester('periode-unit');
const env = newEnv({ now: Date.parse('2026-10-28T13:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.setupLogin();
const ss = c.SpreadsheetApp.getActive(), OP = 'LPP-004';
const su = ss.insertSheet('IMPOR_UNIT');
su.appendRow(['unitId', 'operatorId', 'jenisUnit', 'namaUnit', 'kodeUnit', 'provinsi', 'kabkota']);
su.appendRow(['LPP-004-U01', OP, 'Unit Kerja', 'Unit Adisutjipto', 'JOG', 'DI Yogyakarta', 'Yogyakarta']);
su.appendRow(['LPP-004-U02', OP, 'Kantor Cabang Pembantu', 'Cabang Pembantu Solo', 'SOC', 'Jawa Tengah', 'Solo']);
su.appendRow(['LPP-004-U03', OP, 'Kantor Cabang Pembantu', 'Cabang Pembantu Cilacap', 'CXP', 'Jawa Tengah', 'Cilacap']);
c.terapkanImporAdmin();
env.post({ action: 'authRegister', nama: 'Petugas Uji', email: 'uji@airnav-rekaan.id', jabatan: 'Manager Keamanan', operatorId: OP });
{ const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === 'uji@airnav-rekaan.id')[h.indexOf('status')] = 'Aktif'; }
const login = e => { env.cache.clear(); env.post({ action: 'authRequestCode', email: e }); return env.post({ action: 'authVerify', email: e, code: env.lastCode(e) }).data.token; };
let tok = login('uji@airnav-rekaan.id');
const kpi = () => { c.invalidateDashboardCache_(); return env.get({ action: 'dashboard' }).data; };
const status = () => { const a = login('owner@dkp.go.id'); c.invalidateDashboardCache_(); const r = env.post({ action: 'operatorStatus', sessionToken: a }).data.find(x => x.operatorId === OP); tok = login('uji@airnav-rekaan.id'); return r; };
const save = (unitId, kode, sk, a, k, s, bulan, tahun) => env.post({ action: 'create', sessionToken: tok, operatorId: OP, jenisOperator: 'LPPNPI', namaOperator: 'AirNav Indonesia Cabang Yogyakarta (Kulonprogo)', unitId,
  kategori: kode + ' - ' + KAT[kode], skenario: sk, ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: s, bulan, tahun, tanggalPengesahan: tahun + '-01-10', tanggalKaji: '2027-07-01',
  namaPengisi: 'Petugas Uji', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'GM Cabang' });
const k0 = kpi();
const P1 = [['', '11', 'Siber ATC', 8, 7, 9], ['', '15', 'Penyusupan ruang peralatan', 6, 6, 8], ['', '03', 'Drone pendekatan', 7, 6, 7], ['', '14', 'Bom palsu telepon', 5, 4, 4],
  ['LPP-004-U02', '15', 'Penyusupan ruang peralatan', 5, 7, 8], ['LPP-004-U02', '16', 'Sabotase catu daya radar', 6, 7, 9], ['LPP-004-U02', '14', 'Bom palsu telepon', 4, 4, 4],
  ['LPP-004-U03', '15', 'Penyusupan ruang peralatan', 4, 5, 6], ['LPP-004-U03', '04', 'Unjuk rasa sisi darat', 3, 3, 4]];
T('periode 1: 9 skenario tersimpan (Induk 4, Solo 3, Cilacap 2)', P1.map(p => save(p[0], p[1], p[2], p[3], p[4], p[5], 'Oktober', 2026)).every(r => r.ok));
const k1 = kpi();
T('Dashboard periode 1: +9 skenario, +1 operator mengisi (unit tidak menambah Total Operator)', k1.kpi.totalRisks === k0.kpi.totalRisks + 9 && k1.kpi.filledEntities === k0.kpi.filledEntities + 1 && k1.kpi.totalEntities === k0.kpi.totalEntities, [k0.kpi, k1.kpi]);

// Periode 2: hanya Solo mengkaji ulang, nilai turun (20→15, 22→17, 12→9).
env.advance(90 * 864e5); tok = login('uji@airnav-rekaan.id');
const P2 = [['LPP-004-U02', '15', 'Penyusupan ruang peralatan', 4, 5, 6], ['LPP-004-U02', '16', 'Sabotase catu daya radar', 5, 5, 7], ['LPP-004-U02', '14', 'Bom palsu telepon', 3, 3, 3]];
T('periode 2: kaji ulang Solo (Januari 2027) tersimpan', P2.map(p => save(p[0], p[1], p[2], p[3], p[4], p[5], 'Januari', 2027)).every(r => r.ok));
const k2 = kpi();
T('Dashboard periode 2: jumlah skenario TIDAK bertambah (matriks lama Solo digantikan, bukan ditambah)', k2.kpi.totalRisks === k1.kpi.totalRisks, [k1.kpi.totalRisks, k2.kpi.totalRisks]);
T('Dashboard periode 2: 2 skenario Menengah-Tinggi lama Solo hilang, berganti Menengah', k2.riskDistribution['Menengah-Tinggi'] === k1.riskDistribution['Menengah-Tinggi'] - 2 && k2.riskDistribution.Menengah === k1.riskDistribution.Menengah + 2, [k1.riskDistribution, k2.riskDistribution]);
const st = status();
T('Monitoring Operator: 9 skenario berlaku (bukan 12), 2 dari 3 unit terisi', st.jumlahSkenario === 9 && st.jumlahUnit === 3 && st.unitTerisi === 2, st);
const ul = env.post({ action: 'unitList', sessionToken: tok }).data, n = id => ul.find(u => u.unitId === id).jumlahSkenario;
T('unitList: Solo 3 (bukan 6), Cilacap 2, Adisutjipto 0', n('LPP-004-U02') === 3 && n('LPP-004-U03') === 2 && n('LPP-004-U01') === 0, ul.map(u => [u.unitId, u.jumlahSkenario]));
const rd = env.post({ action: 'riskData', sessionToken: tok }).data;
const cur = rd.filter(x => x.terkini), old = rd.filter(x => !x.terkini);
T('riskData: semua 12 baris tetap ada (riwayat tidak dihapus)', rd.length === 12);
T('riskData: 9 baris terkini = Induk Okt (4) + Cilacap Okt (2) + Solo Jan (3)', cur.length === 9 && cur.filter(x => !x.unitId && x.bulan === 'Oktober').length === 4 && cur.filter(x => x.unitId === 'LPP-004-U03' && x.bulan === 'Oktober').length === 2 && cur.filter(x => x.unitId === 'LPP-004-U02' && x.bulan === 'Januari').length === 3);
T('riskData: 3 baris arsip = Solo Oktober', old.length === 3 && old.every(x => x.unitId === 'LPP-004-U02' && x.bulan === 'Oktober'));
T('rata-rata matriks berlaku turun 17,3 → 15,9 (perbaikan nyata, bukan perbandingan Induk vs Solo)', (cur.reduce((s, x) => s + x.risikoNilai, 0) / cur.length).toFixed(1) === '15.9');

// Kaji ulang SEBAGIAN: Cilacap Februari 2027 hanya 1 skenario → matriks Cilacap = 1 skenario (matriks per periode menggantikan seluruhnya).
env.advance(30 * 864e5); tok = login('uji@airnav-rekaan.id');
T('Cilacap kaji ulang Februari 2027 dengan 1 skenario', save('LPP-004-U03', '15', 'Penyusupan ruang peralatan', 3, 4, 5, 'Februari', 2027).ok);
const k3 = kpi();
T('matriks periode baru MENGGANTIKAN matriks lama unit itu seluruhnya (Cilacap 2 → 1)', k3.kpi.totalRisks === k1.kpi.totalRisks - 1 && status().jumlahSkenario === 8);

// Operator tanpa unit: kaji ulang juga tidak lagi dihitung ganda.
const fx0 = env.rows('RISK_ASSESSMENT').filter(x => x.operatorId === 'BD-100');
T('operator tanpa unit (fixture BD-100): baris lama periode sebelumnya tidak dihitung', (() => {
  const before = kpi().kpi.totalRisks, r0 = fx0[0];
  const s = env.sheets.RISK_ASSESSMENT, h = s._data[0], row = h.map(k => (k === 'riskId' ? 'RISK-LAMA-UJI' : k === 'bulan' ? 'Januari' : k === 'tahun' ? 2020 : k === 'skenario' ? 'Skenario arsip' : r0[k] == null ? '' : r0[k]));
  s.appendRow(row);
  return kpi().kpi.totalRisks === before;
})());
T.done();
