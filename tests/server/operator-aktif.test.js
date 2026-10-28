// V3.37.1 — satu definisi "operator aktif" (opActive_). Mereproduksi temuan produksi 28 Okt 2026:
// Total Operator 448 padahal seharusnya 444, karena (1) dua baris salinan tidak sengaja, (2) baris tanpa
// operatorId yang hanya berisi spasi, (3) status Nonaktif tetapi kolom aktif masih TRUE. Data uji SINTETIS.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('operator-aktif');
const env = newEnv({ now: Date.parse('2026-10-28T12:30:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.setupLogin();
const total = () => { env.cache.clear(); return env.get({ action: 'dashboard' }).data.kpi.totalEntities; };
const base = total();
const op = env.sheets.MASTER_OPERATOR, H = op._data[0], col = k => H.indexOf(k);
const row = o => H.map(k => (o[k] == null ? '' : o[k]));

// Baris tanpa operatorId (hanya spasi di kolom provinsi) — objs_ tidak membuangnya karena tidak kosong total.
op.appendRow(row({ provinsi: ' ' }));
T('baris tanpa operatorId (sel berisi spasi) tidak dihitung sebagai operator', total() === base, { base, now: total() });

// Status Nonaktif tetapi aktif TRUE → dianggap nonaktif.
const r0 = op._data.findIndex((r, i) => i > 0 && r[col('jenisOperator')] === 'Airlines' && String(r[col('aktif')]) !== 'false');
const bbnId = op._data[r0][col('operatorId')];
op._data[r0][col('status')] = 'Nonaktif';
T('status Nonaktif + aktif TRUE → tidak dihitung', total() === base - 1);
op._data[r0][col('status')] = 'Aktif'; op._data[r0][col('aktif')] = false;
T('status Aktif + aktif FALSE → tidak dihitung (perilaku lama dipertahankan)', total() === base - 1);
op._data[r0][col('aktif')] = true;
T('dipulihkan → dihitung lagi', total() === base);

// operatorStatus (Monitoring Operator) & daftar operator publik memakai aturan yang sama.
const adm = (() => { env.cache.clear(); env.post({ action: 'authRequestCode', email: 'owner@dkp.go.id' }); return env.post({ action: 'authVerify', email: 'owner@dkp.go.id', code: env.lastCode('owner@dkp.go.id') }).data.token; })();
op._data[r0][col('status')] = 'Nonaktif';
env.cache.clear();
const st = env.post({ action: 'operatorStatus', sessionToken: adm }).data;
T('Monitoring Operator: jumlah = Total Operator Dashboard, tanpa baris kosong & tanpa operator Nonaktif', st.length === total() && st.every(x => String(x.operatorId).trim()) && !st.some(x => x.operatorId === bbnId), { st: st.length, total: total() });
T('daftar operator publik tidak memuat operator berstatus Nonaktif', !c.operatorMaster_().some(x => x.operatorId === bbnId) && c.operatorMaster_().length === total());
const reg = env.post({ action: 'authRegister', nama: 'Uji', email: 'uji.nonaktif@contoh.id', jabatan: 'AVSEC', operatorId: bbnId });
T('pendaftaran akun untuk operator berstatus Nonaktif ditolak', !reg.ok && /tidak ditemukan/.test(reg.error || ''), reg);

// cekImporAdmin melaporkan kesehatan master tanpa memblokir.
const a = op._data.find((r, i) => i > 0 && r[col('jenisOperator')] === 'Bandar Udara' && r[col('kodeOperator')] && String(r[col('aktif')]) !== 'false');
const b = op._data.find(r => r !== a && r[col('jenisOperator')] === 'Bandar Udara' && r[col('kodeOperator')] && String(r[col('aktif')]) !== 'false' && r[col('status')] === 'Aktif');
b[col('kodeOperator')] = a[col('kodeOperator')];
const ss = c.SpreadsheetApp.getActive(), s = ss.insertSheet('PERBAIKAN_MASTER');
s.appendRow(['operatorId', 'Bandara', 'Kolom', 'Nilai sekarang', 'Nilai baru', 'Dasar']);
s.appendRow([bbnId, 'x', 'aktif', 'TRUE', 'FALSE', 'uji']);
const m = c.cekImporAdmin();
T('cekImporAdmin: menyebut jumlah Total Operator', new RegExp('MASTER_OPERATOR: ' + total() + ' operator aktif').test(m), m);
T('cekImporAdmin: memperingatkan baris tanpa operatorId', /1 baris berisi data tetapi tanpa operatorId/.test(m), m);
T('cekImporAdmin: memperingatkan status/aktif tidak selaras', new RegExp(bbnId + ': status "Nonaktif" tetapi aktif').test(m), m);
T('cekImporAdmin: memperingatkan kode ganda di antara operator aktif', new RegExp('kode ' + a[col('kodeOperator')] + ' dipakai').test(m), m);
T('peringatan tidak memblokir pemeriksaan', /Pemeriksaan bersih/.test(m) && /1 perubahan siap/.test(m), m);
const before = total(), m2 = c.terapkanImporAdmin();
T('terapkan: aktif BBN → FALSE, status tetap Nonaktif, peringatan selaras hilang', /SELESAI/.test(m2) && env.rows('MASTER_OPERATOR').find(x => x.operatorId === bbnId).status === 'Nonaktif' && String(env.rows('MASTER_OPERATOR').find(x => x.operatorId === bbnId).aktif) === 'false' && !new RegExp(bbnId + ': status').test(c.cekImporAdmin()) && total() === before, m2);
T.done();
