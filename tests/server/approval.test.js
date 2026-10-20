// Uji pemicu email persetujuan pendaftar (authOnEdit).
const { fx, tester, newEnv } = require('./_lib.js');
const T = tester('approval');
const env = newEnv();
env.seed('MASTER_OPERATOR', 'H.OP', fx('operators'));
env.ctx.setupLogin();
env.post({ action: 'authRegister', nama: 'Sari', email: 'sari@garuda.co.id', jabatan: 'Avsec', operatorId: 'AIR-GARUDA-INDONESIA' });
const s = env.sheets.USER_ACCESS, h = s._data[0], row = s._data.findIndex(r => r[h.indexOf('email')] === 'sari@garuda.co.id') + 1, col = h.indexOf('status') + 1;
const n0 = env.mails.length;
s.getRange(row, col).setValue('Aktif');
env.ctx.authOnEdit({ range: s.getRange(row, col) });
const u = env.rows('USER_ACCESS').find(x => x.email === 'sari@garuda.co.id'), m = env.mails.slice(n0);
T('status → Aktif: email persetujuan terkirim ke pendaftar', m.length === 1 && m[0].to === 'sari@garuda.co.id' && /sudah aktif/.test(m[0].subject), m);
T('approvedAt / approvedBy terisi otomatis', !!(u.approvedAt && u.approvedBy), u);
env.ctx.authOnEdit({ range: s.getRange(row, 1) });
T('edit kolom lain tidak mengirim email', env.mails.length === n0 + 1);
T.done();
