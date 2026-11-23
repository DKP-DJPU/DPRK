// V3.46 — regresi bug 6 Nov 2026: baris kosong di tengah sheet membuat penulisan bergeser satu baris ke atas
// (edit skenario menimpa skenario operator lain; lastLoginAt / logout ditulis ke akun lain).
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('baris-kosong');
const env = newEnv({ now: Date.parse('2026-11-23T03:00:00Z') });
seedAll(env, { incidents: false });
const c = env.ctx; c.terapkanHitungUlangRisiko(); c.setupLogin();
const activate = (nama, email, op) => { env.post({ action: 'authRegister', nama, email, jabatan: 'AVSEC', operatorId: op }); const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === email)[h.indexOf('status')] = 'Aktif'; };
const login = email => { env.cache.clear(); env.post({ action: 'authRequestCode', email }); return env.post({ action: 'authVerify', email, code: env.lastCode(email) }).data.token; };
activate('Budi', 'budi@juanda.co.id', 'BD-100');
activate('Ani', 'ani@ayani.co.id', 'BD-007');

// --- RISK_ASSESSMENT: sisipkan baris kosong di atas skenario yang akan diedit
const rs = env.sheets.RISK_ASSESSMENT, rh = rs._data[0], ci = rh.indexOf('riskId');
const JU = 'RISK-UJI-0015', at = rs._data.findIndex(r => r[ci] === JU);
rs._data.splice(1, 0, rh.map(() => ''));               // baris 2 kosong → semua skenario bergeser satu baris
const snap = () => rs._data.slice(1).filter(r => r.some(v => v !== '')).map(r => r.slice());
const before = snap(), neighbor = rs._data[at][ci];    // skenario tepat di atas JU (sekarang di baris at+1)
T('persiapan: ada baris kosong dan JU tidak di baris pertama', rs._data[1].every(v => v === '') && neighbor && neighbor !== JU, neighbor);

const bt = login('budi@juanda.co.id'), adm = login('owner@dkp.go.id');
const det = env.post({ action: 'riskDetail', id: JU, sessionToken: bt }).data;
const payload = (x, extra) => Object.assign({ action: 'update', id: x.riskId, editToken: '', operatorId: x.operatorId, jenisOperator: x.jenisOperator, namaOperator: x.namaOperator, kategori: x.kategori, skenario: x.skenario, area: x.area, ancamanNilai: Number(x.ancamanNilai), kerentananNilai: Number(x.kerentananNilai), konsekuensiNilai: Number(x.konsekuensiNilai), perlakuan: x.perlakuan, prioritas: x.prioritas, riskOwner: x.pemilikRisiko, tanggalKaji: x.tanggalKaji || '2026-12-01', tanggalPengesahan: x.tanggalPengesahan, bulan: x.bulan, tahun: x.tahun, namaPengisi: 'Budi', jabatanPengisi: 'AVSEC', rowVersion: x.rowVersion }, extra);
let r = env.post(payload(det, { sessionToken: bt, area: 'Area hasil edit' }));
T('edit lewat akun berhasil', r.ok, r);
const after = snap(), ids = after.map(x => x[ci]);
T('tidak ada riskId ganda setelah edit', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
T('skenario tetangga TIDAK tertimpa', ids.includes(neighbor) && JSON.stringify(after.find(x => x[ci] === neighbor)) === JSON.stringify(before.find(x => x[ci] === neighbor)), neighbor);
T('jumlah skenario tetap', after.length === before.length, [after.length, before.length]);
const ju = env.rows('RISK_ASSESSMENT').find(x => x.riskId === JU);
T('perubahan tersimpan di baris skenario yang benar', ju && ju.area === 'Area hasil edit' && Number(ju.rowVersion) === det.rowVersion + 1, ju && ju.area);
T('baris kosong tetap di tempatnya (tidak diisi)', rs._data[1].every(v => v === ''));

// --- jalur lama (kode referensi) juga memakai nomor baris asli
c.nonaktifkanLoginWajib();
const ju2 = env.rows('RISK_ASSESSMENT').find(x => x.riskId === JU);
r = env.post(payload(Object.assign({}, det, { rowVersion: Number(ju2.rowVersion) }), { editToken: ju2.editToken, area: 'Lewat kode' }));
const ids2 = snap().map(x => x[ci]);
T('edit dengan kode referensi: benar & tanpa riskId ganda', r.ok && env.rows('RISK_ASSESSMENT').find(x => x.riskId === JU).area === 'Lewat kode' && new Set(ids2).size === ids2.length, r);

// --- USER_ACCESS: lastLoginAt ditulis ke akun yang benar
const us = env.sheets.USER_ACCESS, uh = us._data[0], ue = uh.indexOf('email'), ul = uh.indexOf('lastLoginAt');
us._data.splice(1, 0, uh.map(() => ''));
const userRow = e => us._data.find(x => x[ue] === e);
const aniLast = userRow('ani@ayani.co.id')[ul], budiLast0 = userRow('budi@juanda.co.id')[ul];
env.setNow(Date.parse('2026-11-23T05:00:00Z'));
login('budi@juanda.co.id');
T('login: lastLoginAt Budi diperbarui di barisnya sendiri', String(userRow('budi@juanda.co.id')[ul]) !== String(budiLast0) && String(userRow('ani@ayani.co.id')[ul]) === String(aniLast), [budiLast0, userRow('budi@juanda.co.id')[ul], aniLast, userRow('ani@ayani.co.id')[ul]]);
T('baris kosong USER_ACCESS tidak terisi', us._data[1].every(v => v === ''));

// --- AUTH_SESSION: logout menandai sesi yang benar
const ss = env.sheets.AUTH_SESSION, sh = ss._data[0], sst = sh.indexOf('status');
ss._data.splice(1, 0, sh.map(() => ''));
const aktifSebelum = ss._data.filter(x => x[sst] === 'Aktif').length;
env.post({ action: 'authLogout', sessionToken: adm });
const r2 = env.post({ action: 'riskDetail', id: JU, sessionToken: adm });
T('logout: sesi Admin tidak berlaku lagi', !r2.ok && r2.code === 'AUTH_REQUIRED', r2);
T('logout: hanya satu sesi berubah menjadi Keluar, baris kosong tetap kosong', ss._data.filter(x => x[sst] === 'Aktif').length === aktifSebelum - 1 && ss._data[1].every(v => v === ''));

// --- cekIntegritas: membaca saja, melaporkan baris kosong & riskId ganda
rs._data.push(rs._data.find(x => x[ci] === neighbor).slice());
const n0 = JSON.stringify(rs._data), m = c.cekIntegritas();
T('cekIntegritas melaporkan baris kosong RISK_ASSESSMENT', /RISK_ASSESSMENT: 1 baris kosong/.test(m), m);
T('cekIntegritas melaporkan riskId ganda', m.includes('riskId ganda ' + neighbor), m);
T('cekIntegritas tidak mengubah data', JSON.stringify(rs._data) === n0);
rs._data.pop(); rs._data.splice(1, 1); us._data.splice(1, 1); ss._data.splice(1, 1);
const m2 = c.cekIntegritas();
T('data bersih → "tidak ada masalah"', /tidak ada masalah/.test(m2), m2);
T.done();
