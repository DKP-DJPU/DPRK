// V3.37 — ukuran grid Google Sheets. Produksi (28 Okt 2026): RISK_ASSESSMENT tepat 35 kolom (tanpa unitId),
// RISK_HISTORY 20 kolom, grid ±1000 baris. Menulis di luar grid = galat → seluruh simpan bisa gagal.
const { tester, newEnv, fx } = require('./_lib.js');
const T = tester('grid');
const env = newEnv({ now: Date.parse('2026-10-28T03:00:00Z') }), c = env.ctx, ss = c.SpreadsheetApp.getActive();
// Bangun sheet seperti produksi SEBELUM V3.37 (header lama, grid pas).
const OLD_RISK = c.H.RISK.filter(h => h !== 'unitId'), OLD_HIST = c.H.HIST.filter(h => h !== 'unitId');
const mk = (name, header, rows, gridRows, gridCols) => { const s = ss.insertSheet(name); s.appendRow(header); rows.forEach(o => s.appendRow(header.map(k => (o[k] == null ? '' : o[k])))); s._setGrid(gridRows, gridCols); return s; };
mk('MASTER_OPERATOR', c.H.OP, fx('operators'), fx('operators').length + 2, 26);
mk('MASTER_DPRK', c.H.DPRK, fx('dprk'), 998, 26);
const risk = mk('RISK_ASSESSMENT', OLD_RISK, fx('risks'), fx('risks').length + 3, 35);
const hist = mk('RISK_HISTORY', OLD_HIST, [], 2, 20);
T('prasyarat: RISK_ASSESSMENT 35 kolom penuh, grid baris hampir penuh', risk.getMaxColumns() === 35 && risk.getLastColumn() === 35 && risk.getMaxRows() - risk.getLastRow() === 2);
c.setupLogin();
env.cache.clear(); env.post({ action: 'authRequestCode', email: 'owner@dkp.go.id' });
const t = env.post({ action: 'authVerify', email: 'owner@dkp.go.id', code: env.lastCode('owner@dkp.go.id') }).data.token;
const r = env.post({ action: 'create', sessionToken: t, operatorId: 'BD-009', jenisOperator: 'Bandar Udara', namaOperator: 'x', kategori: '01 - X', skenario: 'Grid uji', ancamanNilai: 5, kerentananNilai: 5, konsekuensiNilai: 5, bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2027-01-01', namaPengisi: 'A', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'X' });
T('simpan pertama setelah V3.37: kolom unitId ditambahkan di kolom 36 tanpa galat', r.ok && risk.getRange(1, 36).getValue() === 'unitId' && risk.getMaxColumns() >= 36, r);
T('kolom lama tidak bergeser (rowVersion tetap kolom 35)', risk.getRange(1, 35).getValue() === 'rowVersion' && hist.getRange(1, 21).getValue() === 'unitId');
const rows = Array.from({ length: 40 }, (_, i) => ({ kategori: String((i % 19) + 1).padStart(2, '0') + ' - X', skenario: 'Paket grid ' + i, ancamanNilai: 5, kerentananNilai: 5, konsekuensiNilai: 5 }));
const b = env.post({ action: 'saveRiskBatch', sessionToken: t, operatorId: 'BD-009', bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', batchId: 'BATCHGRID001', rows });
T('simpan per paket 40 baris melewati batas grid baris → grid diperluas, tersimpan', b.ok && b.saved === 40 && env.rows('RISK_ASSESSMENT').filter(x => x.riskId.startsWith('RISK-B-BATCHGRID001')).length === 40 && env.rows('RISK_HISTORY').length >= 40, b);
// impor admin ke MASTER_OPERATOR yang grid-nya hampir penuh
const st = ss.insertSheet('IMPOR_OPERATOR'); st.appendRow(['operatorId', 'jenisOperator', 'namaOperator', 'status', 'aktif']);
for (let i = 1; i <= 63; i++) st.appendRow(['AIR-PAUA-' + i, 'Airlines', 'PAUA ' + i, 'Aktif', true]);
const m = c.terapkanImporAdmin();
T('impor 63 operator ke MASTER_OPERATOR yang grid-nya hampir penuh → tersimpan', /63 operator baru/.test(m) && /SELESAI/.test(m) && env.rows('MASTER_OPERATOR').length === fx('operators').length + 63, m);
const su = ss.insertSheet('IMPOR_UNIT'); su.appendRow(['unitId', 'operatorId', 'jenisUnit', 'namaUnit']);
for (let i = 1; i <= 538; i++) su.appendRow(['AIR-PAUA-1-U' + i, 'AIR-PAUA-1', 'Stasiun', 'Stasiun ' + i]);
ss.deleteSheet(st);
const mu = c.terapkanImporAdmin();
T('impor 538 unit ke MASTER_UNIT baru (sheet baru 26 kolom × 1000 baris) → tersimpan', /538 unit baru/.test(mu) && env.rows('MASTER_UNIT').length === 538, mu.slice(0, 300));
T.done();
