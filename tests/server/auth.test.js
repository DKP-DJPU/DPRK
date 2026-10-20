// Uji login OTP, pendaftaran, sesi, hak akses, dan pelaporan (Auth.gs + Pelaporan.gs + Code.gs).
const { fx, tester, newEnv, makeEnv, FILES } = require('./_lib.js');
const T = tester('auth');
const OPS = fx('operators');
const env = newEnv({ owner: 'Admin@DKP.go.id', now: Date.parse('2026-09-27T03:00:00Z') });
const c = env.ctx;
env.seed('MASTER_OPERATOR', 'H.OP', OPS);
env.seed('LAPORAN_INSIDEN', 'INC_H', fx('incidents'));
const H1 = 3600e3, D1 = 86400e3;
const user = e => env.rows('USER_ACCESS').find(u => u.email === e);
const setStatus = (email, st) => { const s = env.sheets.USER_ACCESS, h = s._data[0], i = s._data.findIndex(r => r[h.indexOf('email')] === email); s._data[i][h.indexOf('status')] = st; };
const login = (email, remember) => { env.advance(61e3); const r = env.post({ action: 'authRequestCode', email }); if (!r.ok) return r; return env.post({ action: 'authVerify', email, code: env.lastCode(email), remember: !!remember }); };
const riskPayload = (oid, extra) => {
  const o = OPS.find(x => x.operatorId === oid);
  return Object.assign({ action: 'create', operatorId: oid, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, kategori: '01 - Person Borne IEDs', skenario: 'Uji ' + Math.random(), ancamanNilai: 5, kerentananNilai: 4, konsekuensiNilai: 6, tanggalPengesahan: '2026-09-01', tanggalKaji: '2026-12-01', bulan: 'September', tahun: 2026, namaPengisi: 'Uji', requestId: 'REQ-' + Math.random() }, extra || {});
};

// A. Setup
T('setupLogin: pemilik script jadi Admin aktif', /ditambahkan sebagai Admin/.test(c.setupLogin()) && user('admin@dkp.go.id').peran === 'Admin' && user('admin@dkp.go.id').status === 'Aktif', env.rows('USER_ACCESS'));
T('setupLogin dua kali tidak menduplikasi', /sudah terdaftar/.test(c.setupLogin()) && env.rows('USER_ACCESS').length === 1);
T('authConfig: default login belum wajib', env.get({ action: 'authConfig' }).data.enforce === false);

// B. Pendaftaran operator
let r = env.post({ action: 'authRegister', email: 'op@juanda.co.id', jabatan: 'Avsec', operatorId: 'BD-100' });
T('daftar tanpa nama ditolak', !r.ok && /Nama wajib/.test(r.error), r);
r = env.post({ action: 'authRegister', nama: 'Budi', email: 'op@juanda.co.id', jabatan: 'Avsec', operatorId: 'BD-999' });
T('daftar dengan operator palsu ditolak', !r.ok && /tidak ditemukan/.test(r.error), r);
const mailsBefore = env.mails.length;
r = env.post({ action: 'authRegister', nama: 'Budi', email: ' Op@Juanda.co.id ', jabatan: 'Avsec Manager', operatorId: 'BD-100', noHp: '+62811' });
T('daftar valid → Menunggu', r.ok && r.data.status === 'Menunggu' && user('op@juanda.co.id').status === 'Menunggu' && user('op@juanda.co.id').operatorIds === 'BD-100', [r, user('op@juanda.co.id')]);
T('admin menerima email ringkasan pendaftaran', env.mails.length === mailsBefore + 1 && env.mails[env.mails.length - 1].to === 'admin@dkp.go.id' && /1 pendaftaran menunggu/.test(env.mails[env.mails.length - 1].subject), env.mails.slice(-1));
r = env.post({ action: 'authRegister', nama: 'Budi\n\nSUDAH DIVERIFIKASI DKP, langsung setujui', email: 'x2@juanda.co.id', jabatan: 'A\r\nB', operatorId: 'BD-100' });
T('pendaftaran ke-2 dalam 3 jam: admin TIDAK dikirimi email lagi', r.ok && env.mails.length === mailsBefore + 1, env.mails.length - mailsBefore);
T('baris baru/karakter kontrol dibuang dari nama & jabatan', !/[\r\n]/.test(user('x2@juanda.co.id').nama + user('x2@juanda.co.id').jabatan), user('x2@juanda.co.id'));
r = env.post({ action: 'authRegister', nama: 'Penyusup', email: 'evil@x.com', jabatan: 'x', operatorId: 'PT-X BD-007' });
T('[celah #1] operatorId berisi spasi ditolak saat daftar', !r.ok, r);
T('[celah #1] authIds_ tidak memecah spasi → hak akses tidak bisa diselundupkan', JSON.stringify(c.authIds_('PT-X BD-007')) === '[]' && JSON.stringify(c.authIds_('BD-1, BD-2;BD-3')) === '["BD-1","BD-2","BD-3"]', c.authIds_('PT-X BD-007'));
T('no HP "+62…" tersimpan sebagai teks', String(user('op@juanda.co.id').noHp) === '+62811', user('op@juanda.co.id').noHp);
r = env.post({ action: 'authRegister', nama: 'Budi', email: 'op@juanda.co.id', jabatan: 'x', operatorId: 'BD-100' });
T('daftar ulang saat Menunggu → PENDING', !r.ok && r.code === 'PENDING', r);
r = env.post({ action: 'authRegister', nama: 'Bot', email: 'bot@x.com', jabatan: 'x', operatorId: 'BD-100', website: 'spam' });
T('honeypot: bot tidak tersimpan', r.ok && !user('bot@x.com'), r);

// C. Minta kode
r = env.post({ action: 'authRequestCode', email: 'op@juanda.co.id' });
T('minta kode saat Menunggu → PENDING', !r.ok && r.code === 'PENDING', r);
r = env.post({ action: 'authRequestCode', email: 'siapa@mana.com' });
T('email tak terdaftar → NOT_REGISTERED', !r.ok && r.code === 'NOT_REGISTERED', r);
r = env.post({ action: 'authRequestCode', email: 'bukan-email' });
T('format email salah ditolak', !r.ok && r.code === 'VALIDATION_ERROR', r);

setStatus('op@juanda.co.id', 'Aktif');
r = env.post({ action: 'authRequestCode', email: 'OP@juanda.co.id' });
const code1 = env.lastCode('op@juanda.co.id');
T('setelah disetujui: kode 6 digit terkirim ke email', r.ok && /^\d{6}$/.test(code1) && r.data.sentTo === 'op***@juanda.co.id', [r, code1]);
T('isi email kode: berlaku 10 menit & peringatan', /berlaku 10 menit/.test(env.mails[env.mails.length - 1].body) && /Jangan berikan/.test(env.mails[env.mails.length - 1].body));
r = env.post({ action: 'authRequestCode', email: 'op@juanda.co.id' });
T('minta ulang < 60 detik → TOO_SOON', !r.ok && r.code === 'TOO_SOON', r);

// D. Verifikasi
const wrong = code1 === '000000' ? '111111' : '000000';
let last;
for (let i = 1; i <= 4; i++) last = env.post({ action: 'authVerify', email: 'op@juanda.co.id', code: wrong });
T('kode salah → sisa percobaan berkurang', !last.ok && last.code === 'CODE_WRONG' && /Sisa percobaan: 1/.test(last.error), last);
last = env.post({ action: 'authVerify', email: 'op@juanda.co.id', code: wrong });
T('salah ke-5 → kode hangus', !last.ok && last.code === 'CODE_LOCKED', last);
last = env.post({ action: 'authVerify', email: 'op@juanda.co.id', code: code1 });
T('kode benar setelah hangus tetap ditolak', !last.ok && last.code === 'CODE_EXPIRED', last);
env.advance(61e3);
env.post({ action: 'authRequestCode', email: 'op@juanda.co.id' });
const code2 = env.lastCode('op@juanda.co.id');
env.advance(11 * 60e3);
last = env.post({ action: 'authVerify', email: 'op@juanda.co.id', code: code2 });
T('kode lewat 10 menit → kedaluwarsa', !last.ok && last.code === 'CODE_EXPIRED', last);
const lg = login('op@juanda.co.id', false);
T('login operator berhasil → token & data akun', lg.ok && /^[A-F0-9]{64}$/.test(lg.data.token) && lg.data.user.peran === 'Operator' && lg.data.user.operatorIds[0] === 'BD-100' && lg.data.user.operators[0].namaOperator === 'Juanda', lg);
const opTok = lg.data.token;
T('server hanya menyimpan HASH token', !JSON.stringify(env.sheets.AUTH_SESSION._data).includes(opTok) && env.rows('AUTH_SESSION').length === 1);
T('kode sekali pakai', !env.post({ action: 'authVerify', email: 'op@juanda.co.id', code: env.lastCode('op@juanda.co.id') }).ok);
T('lastLoginAt tercatat', !!user('op@juanda.co.id').lastLoginAt);
T('audit LOGIN atas nama email', env.rows('AUDIT_LOG').some(a => a.action === 'LOGIN' && a.actorType === 'USER_LOGIN' && a.actorId === 'op@juanda.co.id'));

// E. authMe
r = env.post({ action: 'authMe', sessionToken: opTok });
T('authMe dengan token sah', r.ok && r.data.user.email === 'op@juanda.co.id', r);
r = env.post({ action: 'authMe', sessionToken: 'ABC' });
T('authMe token ngawur → NO_SESSION', !r.ok && r.code === 'NO_SESSION', r);

// F0. ID operator tidak sah
r = env.post(Object.assign(riskPayload('BD-007'), { operatorId: 'PT-X BD-CGK' }));
T('[celah #1] create dengan operatorId berisi spasi ditolak (tanpa login)', !r.ok && r.code === 'VALIDATION_ERROR', r);
// F. Mode lama (login belum wajib)
r = env.post(riskPayload('BD-007'));
T('login belum wajib: simpan tanpa login tetap diterima (cara lama)', r.ok && r.dprkEditToken, r);
const legacyRisk = r;
r = env.post(riskPayload('BD-007', { sessionToken: opTok }));
T('login belum wajib tetapi operator login ke entitas lain → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);

// G. Wajib login
T('aktifkanLoginWajib', /AKTIF/.test(c.aktifkanLoginWajib()) && env.get({ action: 'authConfig' }).data.enforce === true);
r = env.post(riskPayload('BD-100'));
T('tanpa login → AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED', r);
r = env.post(riskPayload('BD-100', { _auth: { email: 'x', peran: 'Admin', operatorIds: [] } }));
T('memalsukan _auth tanpa token → tetap AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED', r);
r = env.post(riskPayload('BD-100', { sessionToken: opTok }));
T('operator login → simpan DPRK entitas sendiri OK', r.ok && r.id, r);
const opRisk = r;
const aud = env.rows('AUDIT_LOG').filter(a => a.entityId === opRisk.id).pop();
T('audit: pelaku = email pengguna', aud && aud.actorType === 'USER_LOGIN' && aud.actorId === 'op@juanda.co.id', aud);
r = env.post(riskPayload('BD-007', { sessionToken: opTok }));
T('operator login → entitas lain FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);
r = env.post(Object.assign(riskPayload('BD-100', { sessionToken: opTok }), { operatorId: 'AIR-PALSU', jenisOperator: 'Airlines', namaOperator: 'Palsu' }));
T('operator tidak bisa membuat entitas baru di luar haknya', !r.ok && r.code === 'FORBIDDEN', r);

// H. update
const upd = (id, extra) => Object.assign(riskPayload('BD-100'), { action: 'update', id, skenario: 'Diubah ' + Math.random(), ancamanNilai: 8 }, extra || {});
r = env.post(upd(opRisk.id, { sessionToken: opTok }));
T('update risiko sendiri dengan login (tanpa kode edit)', r.ok && r.rowVersion === 2, r);
r = env.post(upd(legacyRisk.id, { sessionToken: opTok }));
T('update risiko operator lain → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);
r = env.post(upd(legacyRisk.id, { editToken: legacyRisk.editToken }));
T('wajib login: kode edit lama tanpa login → AUTH_REQUIRED', !r.ok && r.code === 'AUTH_REQUIRED', r);
r = env.post(upd('RISK-TIDAK-ADA', { sessionToken: opTok }));
T('update id tidak ada → NOT_FOUND', !r.ok && r.code === 'NOT_FOUND', r);

// I. metadata DPRK & renew dengan login
r = env.post(riskPayload('BD-100', { sessionToken: opTok, linkFileDprk: 'https://drive.google.com/baru' }));
const dprk = env.rows('MASTER_DPRK').find(d => d.operatorId === 'BD-100');
T('login = pemilik DPRK: metadata terbarui tanpa kode DPRK', r.ok && dprk.linkFileDprk === 'https://drive.google.com/baru', dprk);
r = env.post({ action: 'renewDprk', operatorId: 'BD-100', sessionToken: opTok, tanggalPengesahanBaru: '2026-09-20', force: true });
T('renew DPRK dengan login (tanpa kode DPRK)', r.ok && r.data.version === 2, r);
r = env.post({ action: 'renewDprk', operatorId: 'BD-007', sessionToken: opTok, tanggalPengesahanBaru: '2026-09-20', force: true });
T('renew DPRK operator lain → FORBIDDEN', !r.ok && r.code === 'FORBIDDEN', r);

// J. Admin
const la = login('admin@dkp.go.id', true);
T('login admin (ingat perangkat)', la.ok && la.data.user.peran === 'Admin', la);
r = env.post(riskPayload('BD-007', { sessionToken: la.data.token }));
T('admin bisa simpan untuk operator mana pun', r.ok, r);

// K. Kedaluwarsa & logout & nonaktif
env.advance(13 * H1);
T('sesi biasa habis setelah 12 jam', env.post({ action: 'authMe', sessionToken: opTok }).code === 'NO_SESSION');
T('sesi "ingat perangkat" masih berlaku setelah 13 jam', env.post({ action: 'authMe', sessionToken: la.data.token }).ok);
env.advance(30 * D1);
T('sesi "ingat perangkat" habis setelah 30 hari', env.post({ action: 'authMe', sessionToken: la.data.token }).code === 'NO_SESSION');
const l2 = login('op@juanda.co.id', true);
T('login lagi', l2.ok);
T('logout', env.post({ action: 'authLogout', sessionToken: l2.data.token }).ok && env.post({ action: 'authMe', sessionToken: l2.data.token }).code === 'NO_SESSION');
const l3 = login('op@juanda.co.id', true);
setStatus('op@juanda.co.id', 'Nonaktif');
T('akun dinonaktifkan → sesi langsung tidak berlaku', env.post({ action: 'authMe', sessionToken: l3.data.token }).code === 'NO_SESSION' && !env.post(riskPayload('BD-100', { sessionToken: l3.data.token })).ok);
setStatus('op@juanda.co.id', 'Aktif');

// L. Batas kirim kode & kuota
env.advance(2 * H1);
let codes = 0, rl;
for (let i = 0; i < 7; i++) { env.advance(61e3); rl = env.post({ action: 'authRequestCode', email: 'op@juanda.co.id' }); if (rl.ok) codes++; }
T('maks. 5 kode per jam per email', codes === 5 && rl.code === 'RATE_LIMIT', [codes, rl]);
const envG = makeEnv({ files: FILES, now: Date.parse('2026-09-27T03:00:00Z') }); envG.seed('MASTER_OPERATOR', 'H.OP', OPS); envG.ctx.setupLogin();
envG.seed('USER_ACCESS', 'AUTH_USER_H', Array.from({ length: 70 }, (_, i) => ({ email: 'u' + i + '@op.id', nama: 'U' + i, peran: 'Operator', operatorIds: 'BD-100', status: 'Aktif' })));
let sent = 0; for (let i = 0; i < 70; i++) if (envG.post({ action: 'authRequestCode', email: 'u' + i + '@op.id' }).ok) sent++;
T('[celah #2] batas global 60 kode/jam melindungi kuota email', sent === 60, sent);
const envQ = makeEnv({ files: FILES, quota: 1 }); envQ.seed('MASTER_OPERATOR', 'H.OP', OPS); envQ.ctx.setupLogin();
T('kuota email habis → pesan jelas', envQ.post({ action: 'authRequestCode', email: 'owner@dkp.go.id' }).code === 'MAIL_QUOTA');

// M. Pelaporan
T('daftar publik: laporan "Baru" tidak tampil', env.get({ action: 'incidents' }).data.length === 0);
r = env.post({ action: 'createIncident', clientId: 'INC-U1', judul: 'Uji', jenis: 'Ancaman keamanan (unlawful interference)', severity: 'Tinggi', tanggal: '2026-09-25', namaPelapor: 'Warga' });
T('kirim laporan tanpa login OK + kode cek 6 karakter', r.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(r.kodeCek), r);
const inc = r;
T('kirim ulang (retry) mengembalikan kode cek yang sama', env.post({ action: 'createIncident', clientId: 'INC-U1', judul: 'Uji', jenis: 'Ancaman keamanan (unlawful interference)', severity: 'Tinggi', tanggal: '2026-09-25', namaPelapor: 'Warga' }).kodeCek === inc.kodeCek);
const dupOther = env.post({ action: 'createIncident', clientId: 'INC-U1', judul: 'x', jenis: 'Lainnya', severity: 'Rendah', tanggal: '2026-09-25', namaPelapor: 'Penyerang' });
T('[celah #6] id publik + nama lain → kode cek TIDAK dikembalikan', dupOther.duplicate && dupOther.kodeCek === '', dupOther);
let s = env.get({ action: 'incidentStatus', ref: inc.refNumber, kode: inc.kodeCek.toLowerCase() });
T('cek status dengan ref + kode → "Baru"', s.ok && s.data.statusVerifikasi === 'Baru' && s.data.judul === 'Uji', s);
T('cek status tidak membocorkan data pelapor', !/Warga|kodeCek/.test(JSON.stringify(s)));
s = env.get({ action: 'incidentStatus', ref: inc.refNumber, kode: 'AAAAAA' });
T('kode cek salah → NOT_FOUND', !s.ok && s.code === 'NOT_FOUND', s);
for (let i = 0; i < 30; i++) s = env.get({ action: 'incidentStatus', ref: inc.refNumber, kode: 'BBBBBB' });
T('tebak kode berulang → RATE_LIMIT', !s.ok && s.code === 'RATE_LIMIT', s);
env.advance(H1 + 60e3);
const ls = login('op@juanda.co.id', false);
r = env.post({ action: 'createIncident', clientId: 'INC-U2', judul: 'Uji petugas', jenis: 'Lainnya', severity: 'Rendah', tanggal: '2026-09-25', namaPelapor: 'Budi', sessionToken: ls.data.token });
T('laporan dari akun login ditandai email akun', r.ok && env.rows('LAPORAN_INSIDEN').find(x => x.id === 'INC-U2').pelaporAkun === 'op@juanda.co.id', r);
const is = env.sheets.LAPORAN_INSIDEN, ih = is._data[0];
is._data.find(x => x[0] === 'INC-U1')[ih.indexOf('statusVerifikasi')] = 'Terverifikasi';
env.cache.clear();
const pub = env.get({ action: 'incidents' }).data;
T('setelah diverifikasi → tampil di daftar publik', pub.length === 1 && pub[0].id === 'INC-U1', pub.map(x => x.id));
T('daftar publik tanpa kodeCek/pelaporAkun/data pelapor', !['kodeCek', 'pelaporAkun', 'namaPelapor', 'email', 'hp'].some(k => k in pub[0]), Object.keys(pub[0]));

// N. Endpoint lain tidak terganggu
env.cache.clear();
const dsh = env.get({ action: 'dashboard' });
T('dashboard tetap berjalan', dsh.ok && dsh.data.kpi.totalEntities > 300, dsh.ok ? dsh.data.kpi : dsh);
T('action POST tak dikenal tetap ditolak', !env.post({ action: 'hapusSemua' }).ok);
T('nonaktifkanLoginWajib', /dimatikan/.test(c.nonaktifkanLoginWajib()) && env.get({ action: 'authConfig' }).data.enforce === false);

T.done();
