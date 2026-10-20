// V3.36 — edit skenario lewat akun login (tanpa kode referensi): riskDetail + update via sesi.
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('edit-login');
const env = newEnv({ now: Date.parse('2026-10-20T03:00:00Z') });
seedAll(env, { incidents: false });
const c = env.ctx; c.terapkanHitungUlangRisiko(); c.setupLogin();
const login = email => { env.cache.clear(); env.post({ action: 'authRequestCode', email }); return env.post({ action: 'authVerify', email, code: env.lastCode(email) }).data.token; };
const activate = (nama, email, op) => { env.post({ action: 'authRegister', nama, email, jabatan: 'AVSEC', operatorId: op }); const us = env.sheets.USER_ACCESS, h = us._data[0]; us._data.find(x => x[h.indexOf('email')] === email)[h.indexOf('status')] = 'Aktif'; };
activate('Budi', 'budi@juanda.co.id', 'BD-100');
activate('Ani', 'ani@ayani.co.id', 'BD-007');
const row = id => env.rows('RISK_ASSESSMENT').find(r => r.riskId === id);
// DPRK Juanda punya metadata dokumen
const dh = env.sheets.MASTER_DPRK._data[0], dj = env.sheets.MASTER_DPRK._data.find(x => x[dh.indexOf('operatorId')] === 'BD-100');
dj[dh.indexOf('emailRiskOwner')] = 'owner@juanda.co.id'; dj[dh.indexOf('linkFileDprk')] = 'https://drive.google.com/file/d/abc';
dj[dh.indexOf('tanggalPengesahan')] = new Date(Date.UTC(2026, 6, 1, 3)); // Sheets menyimpan tanggal sebagai Date
const JU = 'RISK-UJI-0015', AY = 'RISK-UJI-0001';

// --- riskDetail
let r = env.post({ action: 'riskDetail', id: JU });
T('tanpa login → AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED', r);
const bt = login('budi@juanda.co.id'), at = login('ani@ayani.co.id'), adm = login('owner@dkp.go.id');
r = env.post({ action: 'riskDetail', id: JU, sessionToken: bt });
T('operator: riskDetail miliknya → lengkap', r.ok && r.data.riskId === JU && r.data.skenario && r.data.ancamanNilai > 0 && r.data.rowVersion >= 1, r);
T('riskDetail TIDAK memuat editToken/dprkEditToken', r.ok && !('editToken' in r.data) && !('dprkEditToken' in r.data));
T('riskDetail memuat metadata DPRK (tanggal pengesahan sebagai yyyy-MM-dd, email, link)', r.ok && r.data.tanggalPengesahan === '2026-07-01' && r.data.emailRiskOwner === 'owner@juanda.co.id' && r.data.linkFileDprk === 'https://drive.google.com/file/d/abc', r.data && [r.data.tanggalPengesahan, r.data.emailRiskOwner]);
const other = env.post({ action: 'riskDetail', id: AY, sessionToken: bt }), ghost = env.post({ action: 'riskDetail', id: 'RISK-TIDAK-ADA', sessionToken: bt });
T('operator: riskDetail operator lain ditolak, pesan sama dengan id tidak ada', !other.ok && other.code === 'NOT_FOUND' && !ghost.ok && ghost.error === other.error && !JSON.stringify(other).includes('Achmad'), other);
T('tanggal kaji ulang kosong di baris risiko → diisi dari tanggal kaji ulang DPRK (2026-11-01)', r.ok && r.data.tanggalKaji === '2026-11-01', r.data && r.data.tanggalKaji);
T('admin: riskDetail operator mana pun', env.post({ action: 'riskDetail', id: AY, sessionToken: adm }).ok && env.post({ action: 'riskDetail', id: JU, sessionToken: adm }).ok);
T('riskDetail tanpa id → ditolak', !env.post({ action: 'riskDetail', sessionToken: adm }).ok);
T('riskDetail tetap jalan saat lock sibuk (baca tanpa lock)', (() => { const L = c.LockService.getScriptLock; c.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} }); const x = env.post({ action: 'riskDetail', id: JU, sessionToken: bt }); c.LockService.getScriptLock = L; return x.ok; })());

// --- update lewat sesi (tanpa editToken), seperti yang dikirim frontend
const det = env.post({ action: 'riskDetail', id: JU, sessionToken: bt }).data;
const payload = (x, extra) => Object.assign({ action: 'update', id: x.riskId, editToken: '', operatorId: x.operatorId, jenisOperator: x.jenisOperator, namaOperator: x.namaOperator, kategori: x.kategori, skenario: x.skenario, area: x.area, ancamanNilai: Number(x.ancamanNilai), kerentananNilai: Number(x.kerentananNilai), konsekuensiNilai: Number(x.konsekuensiNilai), perlakuan: x.perlakuan, prioritas: x.prioritas, riskOwner: x.pemilikRisiko, tanggalKaji: x.tanggalKaji || '2026-12-01', tanggalPengesahan: x.tanggalPengesahan, bulan: x.bulan, tahun: x.tahun, namaPengisi: 'Budi', jabatanPengisi: 'AVSEC', rowVersion: x.rowVersion }, extra);
r = env.post(payload(det, { sessionToken: bt, area: 'Area diubah via login', ancamanNilai: 9, kerentananNilai: 9, konsekuensiNilai: 9, riskOwner: 'GM Bandara Baru' }));
T('operator: update miliknya tanpa kode referensi → berhasil', r.ok && r.rowVersion === det.rowVersion + 1, r);
const after = row(JU);
T('perubahan tersimpan & dihitung ulang server (27 → Tinggi / Tidak dapat ditoleransi)', after.area === 'Area diubah via login' && Number(after.risikoNilai) === 27 && after.risikoRating === 'Tinggi' && after.kategoriPenerimaan === 'Tidak dapat ditoleransi', after);
T('Pemilik Risiko yang diubah ikut tersimpan', after.pemilikRisiko === 'GM Bandara Baru', after.pemilikRisiko);
T('editToken lama tetap (kode referensi lama masih berlaku)', after.editToken === 'TOKRISK15', after.editToken);
const aud = env.rows('AUDIT_LOG').filter(a => a.entityId === JU).pop();
T('audit mencatat USER_LOGIN + email pengubah', aud && aud.actorType === 'USER_LOGIN' && aud.actorId === 'budi@juanda.co.id', aud);
r = env.post(payload(det, { sessionToken: bt, area: 'versi basi' }));
T('rowVersion basi → STALE_RECORD (tidak menimpa perubahan orang lain)', !r.ok && r.code === 'STALE_RECORD' && row(JU).area === 'Area diubah via login', r);
const dAy = env.post({ action: 'riskDetail', id: AY, sessionToken: adm }).data;
r = env.post(payload(dAy, { sessionToken: bt, area: 'serangan' }));
T('operator: update skenario operator lain → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN' && row(AY).area !== 'serangan', r);
r = env.post(payload(dAy, { sessionToken: bt, operatorId: 'BD-100', area: 'serangan2' }));
T('memalsukan operatorId di payload tidak menembus (operator dari data server)', !r.ok && row(AY).area !== 'serangan2', r);
r = env.post(payload(dAy, { sessionToken: at, area: 'diubah pemilik' }));
T('operator lain (pemilik A. Yani) → berhasil', r.ok && row(AY).area === 'diubah pemilik', r);
r = env.post(payload(dAy, { sessionToken: adm, rowVersion: dAy.rowVersion + 1, area: 'diubah admin' }));
T('admin: update operator mana pun', r.ok && row(AY).area === 'diubah admin', r);
r = env.post(payload(det, { area: 'tanpa sesi', rowVersion: row(JU).rowVersion }));
T('tanpa sesi & tanpa kode → ditolak', !r.ok && row(JU).area === 'Area diubah via login', r);
c.aktifkanLoginWajib();
r = env.post(payload(det, { editToken: 'TOKRISK15', area: 'pakai kode', rowVersion: Number(row(JU).rowVersion) }));
T('login wajib aktif: kode referensi saja tidak cukup', !r.ok && r.code === 'AUTH_REQUIRED', r);
c.nonaktifkanLoginWajib();
r = env.post(payload(det, { editToken: 'TOKRISK15', area: 'pakai kode', rowVersion: Number(row(JU).rowVersion) }));
T('login belum wajib: jalur lama dengan kode referensi tetap jalan', r.ok && row(JU).area === 'pakai kode', r);
T.done();
