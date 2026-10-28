// V3.37.2 — impor ulang IMPOR_UNIT yang sama tidak boleh menulis ulang semua unit. Produksi 28 Okt 2026:
// terapkanImporAdmin kedua melaporkan "538 unit diperbarui" lalu "Exceeded maximum execution time" karena setiap
// unit dicari & ditulis satu per satu. Data uji SINTETIS.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('impor-ulang');
const env = newEnv({ now: Date.parse('2026-10-28T12:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
const ss = c.SpreadsheetApp.getActive();
const opId = env.rows('MASTER_OPERATOR').find(o => o.jenisOperator === 'Airlines' && String(o.aktif) !== 'false').operatorId;
const N = 538;
const su = ss.insertSheet('IMPOR_UNIT');
su.appendRow(['unitId', 'operatorId', 'jenisUnit', 'namaUnit', 'kodeUnit', 'provinsi', 'kabkota']);
for (let i = 1; i <= N; i++) su.appendRow([opId + '-S' + i, opId, 'Stasiun', 'Stasiun Uji ' + i, 'S' + i, 'Prov', 'Kota']);
const m1 = c.terapkanImporAdmin();
T('impor pertama: 538 unit baru', new RegExp(N + ' unit baru, 0 unit diperbarui').test(m1) && /SELESAI/.test(m1), m1);
const stamp = () => env.rows('MASTER_UNIT').map(u => String(u.updatedAt));
const before = stamp();

// Hitung penulisan ke MASTER_UNIT pada impor kedua.
const us = env.sheets.MASTER_UNIT, orig = us.getRange.bind(us);
let writes = 0;
us.getRange = (...a) => { const r = orig(...a), sv = r.setValues.bind(r); r.setValues = v => { writes++; return sv(v); }; return r; };
env.advance && env.advance(60000);
const m2 = c.cekImporAdmin();
T('cek ulang data yang sama: 0 diperbarui, 538 tidak berubah', new RegExp('0 unit baru, 0 unit diperbarui, ' + N + ' tidak berubah').test(m2), m2);
const m3 = c.terapkanImporAdmin();
T('terapkan ulang data yang sama: tidak ada penulisan ke MASTER_UNIT', /SELESAI/.test(m3) && writes === 0, { writes, m3: m3.slice(-300) });
T('updatedAt unit tidak berubah bila isinya sama', JSON.stringify(stamp()) === JSON.stringify(before));

// Ubah 2 unit (nama & nonaktif) → hanya 2 yang diperbarui, dengan SATU penulisan.
su._data[5][3] = 'Stasiun Uji 5 (ganti nama)';
su._data[0].push('aktif'); su._data.forEach((r, i) => { if (i) r.push(i === 9 ? 'FALSE' : ''); });
writes = 0;
const m4 = c.terapkanImporAdmin();
T('2 unit berubah → "2 unit diperbarui", 536 tidak berubah', new RegExp('2 unit diperbarui, ' + (N - 2) + ' tidak berubah').test(m4) && /1 dinonaktifkan/.test(m4), m4);
T('pembaruan ditulis dalam satu kali penulisan', writes === 1, writes);
const rows = env.rows('MASTER_UNIT'), after = stamp();
T('isi unit yang berubah tersimpan', rows.find(u => u.unitId === opId + '-S5').namaUnit === 'Stasiun Uji 5 (ganti nama)' && String(rows.find(u => u.unitId === opId + '-S9').aktif) === 'false');
T('unit lain tidak tersentuh (updatedAt & isi sama)', after.filter((x, i) => x !== before[i]).length === 2 && rows.length === N && rows.find(u => u.unitId === opId + '-S7').namaUnit === 'Stasiun Uji 7');
T.done();
