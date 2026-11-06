// V3.44 — rekap status DPRK per PROVINSI di dashboard publik. Data SINTETIS.
// Keputusan Alex 6 Nov 2026: publik sampai provinsi; rincian kab/kota hanya Admin (dihitung di browser).
const { tester, newEnv, seedAll, fx } = require('./_lib.js');
const T = tester('rekap-wilayah');
const env = newEnv({ now: Date.parse('2026-11-06T09:00:00Z') }), c = env.ctx;
seedAll(env, { incidents: false });
const sh = env.sheets.MASTER_OPERATOR, h = sh._data[0], row = id => sh._data.find(r => r[h.indexOf('operatorId')] === id);
const set = (id, k, v) => { row(id)[h.indexOf(k)] = v; };
set('BD-222', 'kodeWilayah', '36.71');             // tercatat DKI Jakarta, kode Banten → masuk Banten (kode menang)
set('RA-001', 'provinsi', 'Tangerang');            // nama provinsi tidak resmi, tanpa kode → belum terpetakan
let d = env.get({ action: 'dashboard' }).data, w = d.wilayah, P = k => w.provinsi.find(x => x.kode === k);
T('38 provinsi selalu tampil + kelompok belum terpetakan', w.provinsi.length === 38 && w.belumTerpetakan && w.minGroup === c.MIN_GROUP, w.provinsi.length);
const sum = w.provinsi.reduce((a, x) => a + x.total, 0) + w.belumTerpetakan.total;
T('jumlah operator semua kelompok = Total Operator', sum === d.kpi.totalEntities, [sum, d.kpi.totalEntities]);
const ops = fx('operators').filter(o => String(o.aktif).toLowerCase() !== 'false' && o.status !== 'Nonaktif');
const nBanten = ops.filter(o => o.provinsi === 'Banten' && o.operatorId !== 'RA-001').length + 1; // + CGK
T('kode wilayah menentukan provinsi: CGK (tercatat DKI Jakarta) dihitung di Banten', P('36').total === nBanten && P('36').terpetakan === 1, [P('36'), nBanten]);
T('provinsi tidak resmi ("Tangerang") → belum terpetakan', w.belumTerpetakan.total === ops.filter(o => !o.provinsi).length + 1, w.belumTerpetakan);
const filledIds = new Set(fx('dprk').filter(x => x.status === 'Aktif').map(x => x.operatorId));
const jatim = ops.filter(o => o.provinsi === 'Jawa Timur');
T('sudah mengisi & persen per provinsi (Jawa Timur)', P('35').filled === jatim.filter(o => filledIds.has(o.operatorId)).length && P('35').pct === Number((P('35').filled / P('35').total * 100).toFixed(1)), P('35'));
T('provinsi tanpa operator: total 0, tidak disembunyikan', w.provinsi.filter(x => x.total === 0).every(x => !x.suppressed && x.filled === 0 && x.pct === null));
T('tidak ada nama operator di rekap publik', !/Juanda|Soekarno|Thai AirAsia|operatorId/.test(JSON.stringify(w)));

// --- supresi: provinsi dengan 1 operator → angka mengisi disembunyikan, + supresi komplementer
const gor = ops.filter(o => o.provinsi === 'Gorontalo').map(o => o.operatorId); // 2 operator
set(gor[0], 'provinsi', 'Sulawesi Utara'); c.invalidateDashboardCache_();
d = env.get({ action: 'dashboard' }).data; w = d.wilayah;
const hidden = w.provinsi.concat([w.belumTerpetakan]).filter(x => x.suppressed);
T('Gorontalo tinggal 1 operator → "sudah mengisi" disembunyikan', P('75').total === 1 && P('75').filled === null && P('75').pct === null && P('75').suppressed, P('75'));
T('supresi komplementer: tepat satu kelompok lain (terkecil) ikut disembunyikan', hidden.length === 2 && hidden.some(x => x.kode !== '75'), hidden.map(x => [x.kode || 'belum', x.total]));
T('angka yang tampil + tersembunyi tetap konsisten dengan KPI (yang tampil ≤ total mengisi)', w.provinsi.concat([w.belumTerpetakan]).filter(x => x.filled != null).reduce((a, x) => a + x.filled, 0) <= d.kpi.filledEntities);
T.done();
