// V3.39 — data induk operator dikunci saat simpan skenario. Temuan 28 Okt 2026 (data REKAAN): petugas stasiun
// CGK Super Air Jet menyimpan dengan Nama Entitas "Super Air Jet Cabang CGK" dan lokasi stasiunnya → nama
// PT Super Air Jet di MASTER_OPERATOR tertimpa, dan provinsi/kabkota/lokasi kosong terisi lokasi stasiun.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('master-kunci');
const env = newEnv({ now: Date.parse('2026-10-28T13:00:00Z'), owner: 'owner@dkp.go.id' }), c = env.ctx;
seedAll(env, { incidents: false });
c.setupLogin();
const OP = 'AIR-SUPER-AIR-JET', master = () => env.rows('MASTER_OPERATOR').find(o => o.operatorId === OP);
const before = JSON.stringify(master());
env.seed('MASTER_UNIT', 'H.UNIT', [{ unitId: OP + '-CGK', operatorId: OP, jenisUnit: 'Stasiun', namaUnit: 'Stasiun CGK – Soekarno-Hatta', kodeUnit: 'CGK', provinsi: 'Banten', kabkota: 'Kota Tangerang', aktif: true },
  { unitId: OP + '-BTH', operatorId: OP, jenisUnit: 'Stasiun', namaUnit: 'Stasiun BTH – Hang Nadim', kodeUnit: 'BTH', provinsi: 'Kepulauan Riau', kabkota: 'Kota Batam', aktif: true }]);
env.post({ action: 'authRegister', nama: 'Uji', email: 'u@saj-rekaan.id', jabatan: 'Station Manager', operatorId: OP });
{ const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === 'u@saj-rekaan.id')[h.indexOf('status')] = 'Aktif'; }
env.cache.clear(); env.post({ action: 'authRequestCode', email: 'u@saj-rekaan.id' });
const tk = env.post({ action: 'authVerify', email: 'u@saj-rekaan.id', code: env.lastCode('u@saj-rekaan.id') }).data.token;
const save = (unitId, nama, prov, kab, lok, jenis, sk) => env.post({ action: 'create', sessionToken: tk, operatorId: OP, jenisOperator: jenis || 'Airlines', namaOperator: nama, provinsi: prov, kabkota: kab, lokasi: lok, kodeOperator: 'XX', iata: 'XX', unitId,
  kategori: '01 - Uji', skenario: sk, ancamanNilai: 5, kerentananNilai: 5, konsekuensiNilai: 5, bulan: 'Oktober', tahun: 2026, tanggalPengesahan: '2026-10-01', tanggalKaji: '2027-04-01', namaPengisi: 'U', perlakuan: 'Mitigasi', prioritas: 'Segera', riskOwner: 'SM' });
const r1 = save(OP + '-CGK', 'Super Air Jet Cabang CGK', 'Banten', 'Kota Tangerang', 'Terminal 1 Soekarno-Hatta', 'Airlines', 'Skenario CGK');
T('simpan dari stasiun CGK berhasil', r1.ok, r1);
T('MASTER_OPERATOR PT Super Air Jet TIDAK berubah (nama, kode, provinsi, kab/kota, lokasi)', JSON.stringify(master()) === before, [JSON.parse(before), master()]);
const row = env.rows('RISK_ASSESSMENT').find(x => x.riskId === r1.id);
T('baris risiko memakai nama & jenis dari master, unit tetap tercatat', row.namaOperator === 'PT Super Air Jet' && row.jenisOperator === 'Airlines' && row.unitId === OP + '-CGK', row);
const d = env.rows('MASTER_DPRK').find(x => x.operatorId === OP);
T('DPRK baru memakai nama dari master', d && d.namaOperator === 'PT Super Air Jet', d);
const r2 = save(OP + '-BTH', 'SAJ Batam', 'Kepulauan Riau', 'Batam', 'Hang Nadim', 'Bandar Udara', 'Skenario BTH');
T('stasiun kedua (Batam) dengan jenis salah di formulir → tetap tersimpan sebagai Airlines, master tetap', r2.ok && env.rows('RISK_ASSESSMENT').find(x => x.riskId === r2.id).jenisOperator === 'Airlines' && JSON.stringify(master()) === before, r2);
T('tidak ada operator baru yang tercipta dari isian formulir', env.rows('MASTER_OPERATOR').length === JSON.parse(JSON.stringify(require('../fixtures/operators.json'))).length);
T.done();
