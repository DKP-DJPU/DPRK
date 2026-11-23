// V3.47 — versi server di setiap respons + ERROR_LOG (tanpa isi permintaan / token).
const { tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('v347');
const env = newEnv({ now: Date.parse('2026-11-23T03:00:00Z') });
seedAll(env, { incidents: false });
const c = env.ctx; c.setupLogin();

let r = env.get({ action: 'dashboard' });
T('respons GET membawa serverVersion = SERVER_VERSION', r.ok && r.serverVersion === c.SERVER_VERSION && /^V\d+\.\d+/.test(r.serverVersion), r.serverVersion);
r = env.post({ action: 'riskData' });
T('respons POST (termasuk penolakan) membawa serverVersion', !r.ok && r.serverVersion === c.SERVER_VERSION, r);
T('versi website (app.js EXPECTED_SERVER) sama dengan SERVER_VERSION di Code.gs', require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'assets', 'js', 'app.js'), 'utf8').includes('EXPECTED_SERVER = "' + c.SERVER_VERSION + '"'));

// paksa galat di jalur baca publik dan jalur simpan
const D = c.dashboard_; c.dashboard_ = () => { throw new Error('uji galat dashboard token ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'); };
env.cache.clear(); r = env.get({ action: 'dashboard' }); c.dashboard_ = D;
T('galat baca → pesan umum ke pengguna (tanpa detail)', !r.ok && r.code === 'READ_ERROR' && !/uji galat/.test(r.error), r);
const el = () => env.rows('ERROR_LOG');
T('galat tercatat di ERROR_LOG (tempat, aksi, versi)', el().length === 1 && el()[0].tempat === 'doGet' && el()[0].aksi === 'dashboard' && el()[0].versi === c.SERVER_VERSION, el());
T('ERROR_LOG menyamarkan token panjang di pesan', el()[0].pesan.includes('[…]') && !el()[0].pesan.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), el()[0].pesan);
const S = c.createRisk_; c.createRisk_ = () => { throw new Error('uji galat simpan'); };
r = env.post({ action: 'create', skenario: 'TEKS RAHASIA SKENARIO', operatorId: 'BD-100' }); c.createRisk_ = S;
T('galat simpan → SERVER_ERROR + tercatat, isi permintaan TIDAK ikut tersimpan', !r.ok && r.code === 'SERVER_ERROR' && el().length === 2 && el()[1].tempat === 'doPost' && el()[1].aksi === 'create' && !JSON.stringify(el()).includes('TEKS RAHASIA'), el()[1]);
const m = c.cekIntegritas();
T('cekIntegritas merangkum ERROR_LOG 7 hari terakhir', /ERROR_LOG: 2 error dalam 7 hari terakhir/.test(m) && /doGet \(dashboard\) ×1/.test(m), m);
T.done();
